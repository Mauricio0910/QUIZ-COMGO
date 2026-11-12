# COMPLIANCE & GOVERNANÇA QUIZ LIVE — FACDO
Quiz ao vivo com 30 questões, 5 alternativas, ranking e bônus de rapidez.

## Publicar
Envie somente os arquivos desta pasta `public` para a raiz de um repositório GitHub, por exemplo `compliance-governanca-quiz`, e ative GitHub Pages em Settings → Pages → Deploy from a branch → main → /(root).

## Firebase
A configuração Web já aponta para o mesmo projeto usado anteriormente. O novo quiz grava em `complianceQuiz`, separado do COMEX (`game`).
Publique o conteúdo de `database.rules.json` em Realtime Database → Rules. O arquivo preserva as regras do COMEX e adiciona as novas regras.

Confirme no Firebase Authentication:
- Anonymous habilitado;
- Google habilitado;
- domínio do GitHub Pages autorizado.

## Professor
Abra o endereço publicado com `?professor=1`, entre com Google e carregue localmente o arquivo `COMPLIANCE_QUIZ_GABARITO_PRIVADO.json`.
Não publique esse gabarito no GitHub.

Fluxo: Nova sala / zerar → alunos entram → Iniciar jogo → Mostrar resposta → Próxima pergunta → Encerrar → Exportar ranking CSV.
