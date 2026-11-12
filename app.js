
(() => {
  const $=id=>document.getElementById(id);
  const isTeacher=new URLSearchParams(location.search).get("professor")==="1";
  const ROOT=window.COMPLIANCE_DB_ROOT||"complianceQuiz";
  const QUESTIONS=window.COMPLIANCE_QUESTIONS||[];
  const QUESTION_MS=20000;
  const CORRECT_BASE_POINTS=1000;
  const MAX_SPEED_BONUS=500;
  const MAX_POINTS_PER_QUESTION=CORRECT_BASE_POINTS+MAX_SPEED_BONUS;
  let user=null, teacher=false, key=null, config=null, timer=null, answersRef=null;
  firebase.initializeApp(window.COMPLIANCE_FIREBASE_CONFIG);
  const auth=firebase.auth(), db=firebase.database(), root=()=>db.ref(ROOT);
  const qById=id=>QUESTIONS.find(q=>q.id===id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  function show(id){$(id)?.classList.remove("hidden")} function hide(id){$(id)?.classList.add("hidden")}
  function authTeacher(u){return !!(u&&u.email&&u.emailVerified&&u.email.toLowerCase()===String(window.COMPLIANCE_PROFESSOR_EMAIL).toLowerCase())}
  function badge(ok,t){$("connectionBadge").textContent=t;$("connectionBadge").classList.toggle("ok",ok)}
  auth.onAuthStateChanged(async u=>{
    user=u; badge(!!u,u?"Firebase conectado":"autenticando…"); hide("loading");
    if(isTeacher){
      show("teacherPanel"); teacher=authTeacher(u);
      $("teacherLoginBtn").textContent=teacher?"Professor autenticado":"Entrar com Google";
      if(teacher){hide("teacherAuthMsg");show("teacherControls");initTeacher()}else{show("teacherAuthMsg");hide("teacherControls")}
    }else{
      if(!u){try{await auth.signInAnonymously()}catch(e){badge(false,"erro de autenticação")}return}
      initStudent();
    }
  });
  $("teacherLoginBtn")?.addEventListener("click",async()=>{try{await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())}catch(e){alert("Login não concluído: "+e.message)}});

  async function initStudent(){
    const s=await root().child("players/"+user.uid).once("value");
    if(s.exists()){hide("studentJoin");show("studentGame");$("playerName").textContent=s.val().nickname;bindStudent()}
    else{show("studentJoin");hide("studentGame")}
  }
  $("joinBtn")?.addEventListener("click",async()=>{
    const nickname=$("nickname").value.trim();$("joinError").textContent="";
    if(nickname.length<2){$("joinError").textContent="Informe um apelido com pelo menos 2 caracteres.";return}
    const c=(await root().child("config").once("value")).val();
    if(!c||c.status!=="lobby"){$("joinError").textContent="A sala não está aberta para entrada.";return}
    try{await root().child("players/"+user.uid).set({nickname,gameId:c.gameId,joinedAt:firebase.database.ServerValue.TIMESTAMP});$("playerName").textContent=nickname;hide("studentJoin");show("studentGame");bindStudent()}catch(e){$("joinError").textContent=e.message}
  });
  function bindStudent(){
    root().child("config").on("value",s=>{config=s.val();renderStudent()});
    root().child("scores").on("value",s=>renderRanking(s.val()||{},"studentRanking"));
  }
  function shuffle(a,seed){let h=2166136261;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}a=[...a];for(let i=a.length-1;i>0;i--){h^=h<<13;h^=h>>>17;h^=h<<5;let j=(h>>>0)%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
  async function renderStudent(){
    clearInterval(timer); const c=config||{};
    const sc=(await root().child("scores/"+user.uid).once("value")).val();$("myScore").textContent=sc?.points||0;
    if(c.status==="lobby"){$("studentState").textContent="LOBBY";$("studentTitle").textContent="Você entrou. Aguarde o professor iniciar.";$("qCounter").textContent="—";$("choices").innerHTML="";hide("timerWrap");hide("studentFeedback");return}
    if(c.status==="finished"){$("studentState").textContent="ENCERRADO";$("studentTitle").textContent="Quiz encerrado. Confira o ranking final.";$("choices").innerHTML="";hide("timerWrap");return}
    const q=qById(c.questionId);if(!q)return; const idx=QUESTIONS.findIndex(x=>x.id===q.id)+1;$("qCounter").textContent=`${idx}/${QUESTIONS.length}`;$("studentTitle").textContent=q.question;
    const ans=(await root().child(`answers/${q.id}/${user.uid}`).once("value")).val();
    const round=(await root().child(`rounds/${q.id}`).once("value")).val()||{};
    if(c.status==="question"){
      $("studentState").textContent=ans?"RESPOSTA ENVIADA":"RESPONDA";hide("studentFeedback");show("timerWrap");
      const choices=shuffle(q.choices,user.uid+q.id);
      $("choices").innerHTML=choices.map(o=>`<button class="choice ${ans?.choice===o.id?'selected':''}" data-id="${o.id}" ${ans?'disabled':''}>${esc(o.text)}</button>`).join("");
      document.querySelectorAll(".choice").forEach(b=>b.addEventListener("click",()=>submit(q.id,b.dataset.id)));
      const tick=()=>{$("timerBar").style.width=(100*Math.max(0,Number(c.roundEndsAt||0)-Date.now())/QUESTION_MS)+"%"};tick();timer=setInterval(tick,200);
    }else if(c.status==="revealed"){
      $("studentState").textContent="RESPOSTA";hide("timerWrap");
      $("choices").innerHTML=q.choices.map(o=>`<div class="teacher-option ${o.id===round.correctId?'correct':''}">${esc(o.text)}</div>`).join("");
      const ok=ans&&ans.choice===round.correctId,f=$("studentFeedback");f.className="feedback "+(ok?"ok":"bad");f.innerHTML=`<strong>${ok?"Você acertou.":"Resposta correta revelada."}</strong><br>${esc(round.explanation||"")}`;show("studentFeedback");
    }
  }
  async function submit(qid,choice){try{await root().child(`answers/${qid}/${user.uid}`).set({choice,at:firebase.database.ServerValue.TIMESTAMP});renderStudent()}catch(e){alert("Resposta não enviada: "+e.message)}}

  function initTeacher(){
    const saved=localStorage.getItem("complianceQuizAnswerKey");if(saved){try{key=JSON.parse(saved);$("keyStatus").textContent="Gabarito privado recuperado deste navegador.";$("rememberKey").checked=true}catch{}}
    $("answerFile").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const j=JSON.parse(r.result);if(!j.answers)throw Error("Formato inválido");key=j;$("keyStatus").textContent=`Gabarito carregado (${Object.keys(j.answers).length} questões).`;if($("rememberKey").checked)localStorage.setItem("complianceQuizAnswerKey",JSON.stringify(j))}catch(err){alert(err.message)}};r.readAsText(f)});
    $("newGameBtn").onclick=newGame;$("startBtn").onclick=start;$("revealBtn").onclick=reveal;$("nextBtn").onclick=next;$("finishBtn").onclick=finish;$("exportBtn").onclick=exportCSV;
    root().child("config").on("value",s=>{config=s.val();renderTeacher()});root().child("players").on("value",s=>$("playerCount").textContent=s.numChildren());root().child("scores").on("value",s=>renderRanking(s.val()||{},"teacherRanking"));makeQR();
  }
  async function newGame(){
    if(!confirm("Isso apagará participantes, respostas e ranking da sala de Compliance. Continuar?"))return;
    await root().set({config:{gameId:"cg_"+Date.now().toString(36),status:"lobby",questionIndex:-1,questionId:null,updatedAt:firebase.database.ServerValue.TIMESTAMP}})
  }
  async function start(){if(!key){alert("Carregue o gabarito privado.");return}if(!config?.gameId){await newGame();return}openQuestion(0)}
  async function openQuestion(i){
    if(i>=QUESTIONS.length){finish();return}
    const q=QUESTIONS[i];

    // Cria a rodada usando o relógio do próprio Firebase.
    await root().child(`rounds/${q.id}`).set({
      startedAt:firebase.database.ServerValue.TIMESTAMP,
      index:i
    });

    // Lê o timestamp já resolvido pelo servidor.
    const roundSnap=await root().child(`rounds/${q.id}`).once("value");
    const serverStart=Number(roundSnap.val()?.startedAt||Date.now());
    const end=serverStart+QUESTION_MS;

    await root().child(`rounds/${q.id}`).update({endsAt:end});

    await root().child("config").update({
      status:"question",
      questionIndex:i,
      questionId:q.id,
      roundStartedAt:serverStart,
      roundEndsAt:end,
      updatedAt:firebase.database.ServerValue.TIMESTAMP
    });

    if(answersRef)answersRef.off();
    answersRef=root().child("answers/"+q.id);
    answersRef.on("value",()=>recompute());
  }
  async function reveal(){if(!key||!config?.questionId)return;const k=key.answers[config.questionId];await root().child(`rounds/${config.questionId}`).update({correctId:k.correctId,explanation:k.explanation,revealedAt:firebase.database.ServerValue.TIMESTAMP});await recompute();await root().child("config").update({status:"revealed",updatedAt:firebase.database.ServerValue.TIMESTAMP})}
  function next(){openQuestion((config?.questionIndex??-1)+1)}
  async function finish(){await recompute();await root().child("config").update({status:"finished",updatedAt:firebase.database.ServerValue.TIMESTAMP})}
  async function recompute(){
    if(!teacher||!key)return;

    const [ps,as,rs]=await Promise.all([
      root().child("players").once("value"),
      root().child("answers").once("value"),
      root().child("rounds").once("value")
    ]);

    const players=ps.val()||{};
    const answers=as.val()||{};
    const rounds=rs.val()||{};
    const scores={};

    for(const [uid,p] of Object.entries(players)){
      let points=0;
      let correct=0;
      let answered=0;
      let totalTime=0;
      let correctTime=0;
      let speedBonusTotal=0;

      for(const q of QUESTIONS){
        const a=answers[q.id]?.[uid];
        const k=key.answers[q.id];
        const r=rounds[q.id];

        if(!a||!k||!r)continue;

        answered++;

        const startedAt=Number(r.startedAt||0);
        const answeredAt=Number(a.at||0);

        // Tempo individual da resposta, limitado ao tempo oficial da questão.
        const elapsed=Math.max(0,answeredAt-startedAt);
        const cappedElapsed=Math.min(elapsed,QUESTION_MS);

        totalTime+=elapsed;

        if(a.choice===k.correctId){
          correct++;
          correctTime+=elapsed;

          // Pontuação estilo Kahoot adaptada:
          // 0 s        = 1.500 pontos
          // 5 s        = 1.375 pontos
          // 10 s       = 1.250 pontos
          // 15 s       = 1.125 pontos
          // 20 s ou +  = 1.000 pontos
          const remainingRatio=1-(cappedElapsed/QUESTION_MS);
          const speedBonus=Math.round(MAX_SPEED_BONUS*remainingRatio);
          const questionPoints=CORRECT_BASE_POINTS+speedBonus;

          speedBonusTotal+=speedBonus;
          points+=questionPoints;
        }
      }

      scores[uid]={
        nickname:p.nickname,
        points,
        correct,
        answered,
        totalTime,
        correctTime,
        speedBonus:speedBonusTotal,
        avgCorrectTime:correct?Math.round(correctTime/correct):0
      };
    }

    await root().child("scores").set(scores);
  }
  function renderTeacher(){
    const c=config||{};$("teacherStatus").textContent=c.status||"sem sala";const i=Number.isInteger(c.questionIndex)?c.questionIndex:-1;$("teacherCounter").textContent=i>=0?`${i+1}/${QUESTIONS.length}`:"—";const q=qById(c.questionId);$("teacherQuestion").textContent=q?q.question:"Aguardando início.";const k=key?.answers?.[c.questionId];
    $("teacherOptions").innerHTML=q?q.choices.map(o=>`<div class="teacher-option ${c.status==="revealed"&&k?.correctId===o.id?'correct':''}"><strong>${o.id.toUpperCase()}.</strong> ${esc(o.text)}</div>`).join(""):"";clearInterval(timer);const tick=()=>{$("teacherTimer").textContent=c.status==="question"?(Math.max(0,Number(c.roundEndsAt)-Date.now())/1000).toFixed(1)+"s":(c.status==="revealed"?"revelada":"—")};tick();timer=setInterval(tick,100);$("startBtn").disabled=c.status!=="lobby";$("revealBtn").disabled=c.status!=="question";$("nextBtn").disabled=c.status!=="revealed"
  }
  function renderRanking(scores,target){
    const arr=Object.values(scores).sort((a,b)=>
      (b.points||0)-(a.points||0) ||
      (b.correct||0)-(a.correct||0) ||
      (a.avgCorrectTime||Number.MAX_SAFE_INTEGER)-(b.avgCorrectTime||Number.MAX_SAFE_INTEGER)
    );

    $(target).innerHTML=arr.length?arr.map((s,i)=>`
      <div class="rank-row">
        <span class="pos">${i+1}º</span>
        <span>
          <strong>${esc(s.nickname||"Aluno")}</strong>
          <small style="display:block;color:#667085;margin-top:2px">
            ${s.correct||0} acerto(s) · bônus velocidade ${s.speedBonus||0}
          </small>
        </span>
        <span class="pts">${s.points||0} pts</span>
      </div>
    `).join(""):"<p class='small'>Sem pontuação ainda.</p>";

    if(!isTeacher&&user&&scores[user.uid])$("myScore").textContent=(scores[user.uid].points||0)+" pts";
  }
  async function exportCSV(){
    const s=(await root().child("scores").once("value")).val()||{};
    const arr=Object.values(s).sort((a,b)=>
      (b.points||0)-(a.points||0) ||
      (b.correct||0)-(a.correct||0) ||
      (a.avgCorrectTime||Number.MAX_SAFE_INTEGER)-(b.avgCorrectTime||Number.MAX_SAFE_INTEGER)
    );
    const rows=[["Posição","Apelido","Pontos","Acertos","Bônus velocidade","Tempo médio dos acertos (ms)","Respondidas"]];
    arr.forEach((x,i)=>rows.push([
      i+1,x.nickname,x.points||0,x.correct||0,x.speedBonus||0,x.avgCorrectTime||0,x.answered||0
    ]));
    const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\n"),
      blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),
      a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="ranking_compliance_governanca.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function makeQR(){const url=location.origin+location.pathname+"?v=1700";$("studentLink").textContent=url;if(window.QRCode)QRCode.toCanvas(url,{width:190,margin:1},(e,c)=>{if(!e){$("qr").innerHTML="";$("qr").appendChild(c)}})}
})();
