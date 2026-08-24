# Auditoria do fluxo de preços Swift — 24/08/2026

## Conclusão executiva

O erro mostrado no DevTools **não é uma falha do parser nem da Swift**. O navegador
faz o preflight `OPTIONS` para
`https://ytvztfvypiwgnslisxep.supabase.co/functions/v1/swift-price-sync` e o gateway
responde `404 NOT_FOUND`. Portanto, a Edge Function não está implantada nesse
projeto. O `POST` que faria a sincronização nem chega a acontecer. As quatro linhas
vermelhas são novas tentativas de invocação, não quatro consultas ao fornecedor.

O repositório já contém função, configuração e workflow de deploy, mas Git não
implanta uma Edge Function sozinho. A causa operacional imediata é uma destas:

1. o workflow de deploy ainda não rodou em `main` depois da inclusão da função;
2. o ambiente GitHub `production` não possui um `SUPABASE_ACCESS_TOKEN` pessoal;
3. o workflow falhou ou aguarda aprovação do ambiente protegido; ou
4. a função foi implantada em outro project ref.

Mesmo depois de corrigir o deploy, há falhas de desenho severas: não existe
agendamento versionado, a gravação do preço e do histórico não é atômica, um lote
com falhas responde sucesso HTTP, a validação de identidade pelo nome é fraca e o
salvamento do produto é dividido em várias operações que podem deixar estado parcial.

## Fluxo completo observado

1. O admin abre o catálogo. `app.js` carrega os produtos com os metadados de preço
   selecionados por `catalog.js`.
2. Ao salvar um produto, `app.js` primeiro cria/atualiza os dados comuns e o preço
   legado; depois chama separadamente a RPC `set_product_swift_source`; depois salva
   as seções. Não há transação abrangendo as três operações.
3. Ao clicar em atualizar, `catalog.js` confirma apenas que existe uma sessão local e
   chama `supabase.functions.invoke('swift-price-sync')`. O SDK adiciona `apikey` e
   `Authorization`, o que provoca o `OPTIONS` visto na captura.
4. No ambiente da captura, o gateway devolve 404 no `OPTIONS`; por isso CORS impede a
   invocação. A UI normaliza isso como `function_not_found` e não deve repetir um 404.
5. Se implantada, a função responde ao preflight, valida configuração, autentica o
   JWT, chama `is_admin()` (ou valida o segredo de cron), consulta produtos ativos e
   processa até `CONCURRENCY` itens em paralelo.
6. Para cada produto, marca `SYNCING`, baixa a página Swift com CEP de referência,
   valida URL/identidade/moeda/unidade/preço, repete alterações acima do limite,
   atualiza `products` e insere uma observação em `product_price_history`.
7. Em falha, conserva os centavos anteriores e marca `STALE` se já houve sucesso, ou
   `ERROR` se nunca houve. Ao final registra métricas em `swift_price_sync_runs`.
8. Um trigger converte `regular_price_cents` para a coluna decimal legada `price`, que
   continua alimentando os cálculos e rótulos atuais do aplicativo.

## Revisão arquivo por arquivo

### Arquivos de produção

#### `supabase-client.js`

- Fixa o project ref de produção e usa uma chave `sb_publishable_` no navegador.
- Isso é esperado: a publishable key é pública e **não** implanta funções nem
  concede service role.
- O Bearer mostrado na captura é o token da sessão do usuário. Ele precisa existir
  no browser, mas a captura o divulgou; a sessão deve ser encerrada/revogada por
  precaução. Não se deve trocar a publishable key por service role.

#### `catalog.js`

- Define todos os campos Swift retornados pela API e oferece as funções de origem e
  atualização usadas pela tela.
- Faz uma tentativa adicional somente para erros transitórios. Isso não resolve 404;
  a função precisa ser implantada.
- `getSession()` verifica existência local, mas a validação real do JWT ocorre no
  servidor, corretamente.
- Falha: não existe trava contra cliques concorrentes nem idempotency key. Dois cliques
  podem criar duas execuções e duas observações.

#### `swift-sync-ui.js`

- Lê o `Response` preservado pelo SDK e transforma 404, 401, 403, 503, indisponibilidade,
  página inválida e preço ausente em mensagens amigáveis.
- A classificação da captura como `function_not_found` está correta.
- Falha: qualquer 404 é tratado como função ausente, inclusive o 404
  `product_not_found` produzido pela própria função. Isso mascara um produto apagado
  ou inativo como problema de deploy.
- Falha: detalhes operacionais importantes ficam apenas em `console.error`; a tela
  mostra uma frase genérica e não oferece correlation/run id.

#### `app.js`

- Monta a edição da fonte Swift, dispara sincronização individual/em lote e traduz
  os status para a grade administrativa.
- Bloqueia a chamada individual quando não há URL e abre o formulário para correção.
- Falha severa: salvar produto, salvar URL e salvar seções são três commits separados.
  A mensagem "Produto salvo, mas..." confirma que estado parcial é aceito.
- Falha: o fluxo atualiza o campo manual `price` antes de configurar a origem Swift.
  Para um item já integrado isso pode produzir uma alteração temporária/incoerente;
  somente uma sincronização posterior volta a derivá-lo dos centavos confirmados.
- Falha: o botão de lote anuncia "concluída" quando a Edge Function responde HTTP
  200, mesmo se `products_failed` for maior que zero.
- Falha: não há estado visual `busy` nos botões de sincronização; cliques repetidos
  permanecem possíveis.

#### `template.js`

- Renderiza o botão global, as ações por card, os status e o campo de URL Swift.
- Falha: o comando global é um `<div onClick>`, não um `<button>`; não tem semântica
  de desabilitado/carregando e prejudica teclado e prevenção de duplo acionamento.
- Falha: o formulário ainda apresenta o preço legado no mesmo salvamento da fonte
  autoritativa, deixando ambíguo qual valor prevalece.

#### `bulk-actions.js`

- `priceEditPolicy` impede edição inline quando há URL ou `price_source=SWIFT`.
- Essa proteção é somente de interface e não cobre o formulário completo nem um
  cliente REST direto. A invariância deveria ser imposta no banco.

#### `swift-price-core.js`

- É somente um re-export do core compartilhado, para executar os mesmos testes no
  Node sem duplicar regras. Não participa diretamente do bundle remoto.

#### `supabase/functions/_shared/swift-price-core.js`

- Canonicaliza URLs, extrai JSON-LD/JSON, interpreta BRL, identifica tipo/unidade,
  separa promoção condicional e constrói patches de sucesso/falha.
- Falha severa de identidade: basta **uma** palavra com mais de três caracteres do
  nome esperado aparecer no nome coletado. Como muitos produtos contêm "Swift",
  produtos diferentes podem ser aceitos como se fossem o mesmo.
- Falha: se existe `expectedSku`, mas a página não expõe SKU, a validação aceita a
  página; ela só rejeita quando ambos existem e divergem.
- Falha: a extração por regex remove tags, mas preserva texto de scripts; um fallback
  pode capturar preço de dados não visíveis ou de outro bloco da página.
- Falha: a heurística pega a primeira oferta de um array, sem selecionar disponibilidade,
  região ou variante correspondente.
- Limite positivo: preços inválidos e mudanças suspeitas não substituem o último
  preço confirmado.

#### `supabase/functions/swift-price-sync/index.ts`

- É o único componente autorizado a escrever os campos confirmados, usando service
  role internamente. Valida admin dentro do handler porque o gateway JWT está desligado.
- O `OPTIONS` local retorna 200 e permite os headers do SDK. Logo, o 404 da captura
  prova que este código não está atendendo no projeto remoto.
- Falha severa: atualiza `products` e depois insere o histórico em duas requisições.
  O erro do insert de histórico é ignorado. Pode haver preço alterado sem trilha de
  auditoria, contrariando a promessa de fonte auditável.
- Falha severa: lotes retornam 200 mesmo quando todos os produtos falham; somente a
  chamada individual converte falha em 502. Isso cria falso sucesso na UI e no cron.
- Falha: erros ao marcar `SYNCING`, `MISSING_SOURCE`, falha final e run finalizado são
  ignorados. As métricas podem divergir do estado persistido.
- Falha: `productFailureCode` é compartilhado por workers concorrentes; na requisição
  individual não há concorrência prática, mas o desenho é frágil e não registra um
  resumo por produto no lote.
- Falha: a proteção de intervalo consulta a última execução terminada sem lock. Dois
  schedulers simultâneos podem passar pela checagem e executar o mesmo lote.
- Falha: o alerta é apenas um `console.log`; não existe entrega a um canal de alerta.
- Risco operacional: o cookie de região e o HTML real da Swift não foram validados
  neste ambiente, conforme a própria documentação.

#### `supabase/functions/swift-price-sync/smoke.ts`

- Faz uma verificação opcional contra URLs reais.
- Não roda no CI nem no deploy e não envia o mesmo cookie/CEP, headers, timeout ou
  retries da função. Portanto, não valida fielmente o caminho de produção.

#### `supabase/config.toml`

- Define `verify_jwt=false`, necessário para publishable keys modernas alcançarem o
  handler; a função faz autenticação e autorização por conta própria.
- Isso amplia a superfície pública: qualquer pessoa alcança o handler. A segurança
  depende integralmente de manter os checks internos e testá-los em toda mudança.

#### `.github/workflows/deploy-swift-price-sync.yml`

- No push para `main`, implanta no mesmo project ref do frontend e testa o preflight.
- Rejeita segredo ausente e publishable key usada erroneamente como credencial de deploy.
- Falha operacional atual: a presença do arquivo não prova execução bem-sucedida. O
  404 remoto é evidência definitiva de que o artefato ainda não está disponível.
- Falha: o smoke pós-deploy testa somente `OPTIONS`; não testa 401 sem token, 403 para
  usuário comum, 503 de configuração ou um POST administrativo controlado.
- Risco: usa `supabase/setup-cli@v1` com `version: latest`, tornando deploys não
  reproduzíveis.

### Banco e migrações

#### `supabase/024_swift_price_sync.sql`

- Cria enums, campos autoritativos, histórico, runs, view de freshness, trigger de
  compatibilidade e RPC de configuração da fonte.
- Falha severa: a atomicidade entre produto e histórico não foi encapsulada em RPC.
- Falha: `product_price_history` é descrita como imutável, mas não há trigger que
  proíba UPDATE/DELETE do service role ou de um futuro grant.
- Falha: a view calcula `effective_price_status`, mas `catalog.js` lê diretamente
  `products.price_status`; a UI pode continuar mostrando `CURRENT` depois da expiração.
- Falha: o comentário recomenda cron, mas não cria cron. Assim, não existe alteração
  realmente automática por padrão, apenas acionamento manual.
- Falha de evolução: `CREATE TYPE`/`ADD COLUMN` não são idempotentes; aplicar duas
  vezes falha. Isso é aceitável num runner de migrations rigoroso, não em execução
  manual sem tabela de versões verificada.

#### `supabase/025_unified_secure_catalog_import.sql`

- Integra URL/SKU ao importador, bloqueia duplicidade e preserva preço confirmado em
  parte dos casos.
- Falha: ao atualizar um produto, sempre redefine status para `STALE` quando existe
  URL, mesmo que URL/SKU não tenham mudado e o preço continue confirmado.
- Falha: permite que o import altere identidade Swift sem uma observação do fornecedor;
  até a próxima sincronização, metadados confirmados anteriores podem conviver com a
  nova origem.

#### `supabase/027_fix_swift_source_price_status.sql`

- Corrige o `CASE` da RPC para fazer cast explícito ao enum.
- Mantém a falha de consistência: trocar/remover URL limpa erro e muda status, mas não
  limpa `swift_product_id`, SKU coletado, centavos, timestamps, região ou hash antigos.
  Uma nova origem pode aparecer junto de metadados da origem anterior.

#### `supabase/schema.sql`

- Contém o bootstrap anterior; o subsistema Swift depende da aplicação ordenada das
  migrations posteriores. Clonar apenas `schema.sql` não reproduz produção.

#### `supabase/SWIFT_PRICE_SYNC.md`

- Documenta deploy, credencial correta, segredos, recuperação manual e consulta de
  produtos sem fonte.
- A documentação já alerta corretamente que Git não implanta a função e que o site
  real/cookie regional ainda precisam de validação em staging.
- Falha de procedimento: não há runbook de rollback, rota de alerta, SLO, lock de lote,
  reconciliação produto–histórico ou critério de suspensão após falhas repetidas.

### Testes

#### `tests/js/swift-price-core.test.js`

- Cobre unidades, promoção, BRL, URL, freshness, variação suspeita e patches.
- Lacunas críticas: nomes diferentes contendo apenas "Swift", SKU esperado ausente na
  página, múltiplas ofertas, scripts com preços concorrentes e caracteres HTML.

#### `tests/js/swift-sync-ui.test.js`

- Cobre os principais status e preserva o erro original.
- Lacuna: não distingue 404 do gateway (`NOT_FOUND`) de `product_not_found` do handler.

#### `tests/js/swift-sync-catalog.test.js`

- Cobre payload individual/lote, sessão, erro permanente e retry de transporte.
- Lacunas: duplo clique, resposta 200 com falhas, resposta sem métricas e concorrência.

#### `tests/js/swift-source-regression.test.js`

- Garante por inspeção textual CORS, config, retry, URL e layout.
- Esses asserts provam que texto existe no repositório, não que a função foi
  implantada ou que o fluxo funciona contra Supabase/Swift reais.

#### `supabase/tests/*`

- A suíte pgTAP existente cobre catálogo, permissões e importação, mas não possui
  um teste dedicado a `024`/`027`, atomicidade do histórico, freshness ou concorrência.

## Prioridade de correção

### P0 — restaurar serviço sem corromper dados

1. Revogar a sessão cujo Bearer apareceu na captura.
2. Confirmar no GitHub Actions o job `Deploy Swift price sync`, configurar um personal
   access token no environment `production`, implantar no project ref
   `ytvztfvypiwgnslisxep` e exigir `OPTIONS=200`.
3. Aplicar/verificar migrations `024` a `027` antes de permitir POST.
4. Configurar CEP/região/cron secret e validar URLs reais em staging.
5. Manter o acionamento em lote desabilitado até tornar produto + histórico atômicos.

### P1 — consistência e verdade operacional

1. Criar uma RPC transacional que persista observação, produto e run; verificar todo
   erro do banco.
2. Fazer lote com falhas retornar estado HTTP/contrato inequívoco e mostrar resultado
   parcial na UI.
3. Adicionar advisory lock/idempotência e estado `busy` no frontend.
4. Consultar a view de freshness (ou calcular status no select oficial).
5. Tornar troca de origem uma operação transacional que invalide todos os metadados
   pertencentes à origem anterior.

### P2 — confiabilidade do dado

1. Validar identidade por SKU/product ID obrigatório ou por algoritmo de nome que
   remova marca/stopwords e exija correspondência forte; nunca aceitar apenas "Swift".
2. Testar fixture real versionada para cada formato de oferta suportado.
3. Implantar scheduler versionado, alerta externo e reconciliação periódica.
4. Fixar versão do Supabase CLI e ampliar o smoke pós-deploy.

## Critério objetivo para declarar resolvido

- preflight remoto 200 no project ref correto;
- POST sem token 401, usuário comum 403 e admin 200;
- teste real controlado cria exatamente uma observação e atualiza o produto na mesma
  transação;
- falha forçada da história impede a alteração do produto;
- lote parcial é exibido como parcial, nunca como sucesso integral;
- duas execuções simultâneas resultam em um único lote;
- produto errado com a palavra "Swift" é rejeitado;
- status expira para `STALE` sem depender de uma nova execução; e
- cron e alerta são observados em staging por pelo menos um ciclo completo.
