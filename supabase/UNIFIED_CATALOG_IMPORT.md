# Fluxo unificado de importação do catálogo (V0.43)

A importação administrativa usa **um único arquivo** e **uma única chamada RPC
transacional**. A planilha deve conter as abas `Categorias`, `Produtos` e
`Receitas` (abas sem alterações podem permanecer vazias). O modelo baixado pela
tela é a fonte de verdade para os nomes das colunas.

## 1. Preparação

1. Baixe o modelo na tela administrativa.
2. Em `Categorias`, declare categorias de produto (`proteina`), de receita
   (`receita`) e seções específicas (`secao_home`, `secao_receita` ou `secao_produto`) ainda inexistentes.
3. Em `Produtos`, preencha nome, categoria, unidade, imagem e `swift_url`. A URL identifica a página oficial que o sincronizador consulta;
   `swift_sku` é recomendado como segunda chave de identidade.
4. Em `Receitas`, os ingredientes referenciam produtos pelo nome e as tags
   referenciam seções. Assim, categorias e produtos do mesmo arquivo já podem
   ser usados pelas abas seguintes.

O modelo baixável para produtos Swift **não possui a coluna `price`**. Ela foi
removida porque o valor oficial só pode vir do provider. O importador ainda
aceita `price` como coluna opcional para compatibilidade com arquivos antigos e
produtos sem integração, mas esse valor é apenas legado: não cria histórico,
não preenche `price_last_success_at`, não define `CURRENT` e não sobrescreve um
preço Swift já confirmado. Para alterar a origem Swift, inclua `swift_url` e
`swift_sku` junto com os dados completos do produto.

> Para produtos vinculados à Swift, não é necessário informar o preço. O
> Yourcipe consulta automaticamente a página oficial da Swift e confirma o
> preço após a importação.

## 2. Validação antes da confirmação

O navegador aceita apenas `.xlsx`/`.xls`, até 10 MB e 5.000 linhas. Ele valida
as três abas, campos obrigatórios, referências entre abas, tipos, URLs e
colisões por nome, URL Swift ou SKU Swift. A URL é canonicalizada para HTTPS no
host `www.swift.com.br` e não pode conter consulta ou fragmento.

A prévia não grava nada. Ela mostra erros bloqueantes, avisos e o impacto de
cada modo: adicionar, substituir equivalentes ou substituir tudo.

## 3. Confirmação atômica no servidor

O cliente envia categorias, produtos e receitas juntos a
`admin_import_public_catalog`. O servidor repete as validações sensíveis,
confirma que o usuário é administrador e restringe todas as alterações ao
catálogo público (`scope='site'`, sem proprietário). Qualquer erro aborta a
transação completa; não existe catálogo parcialmente importado.

Categorias são resolvidas por tipo e nome/slug normalizado, produtos por nome
normalizado e receitas pelo fluxo único da mesma RPC. Índices únicos impedem
que importações concorrentes ou edições manuais associem uma URL ou SKU Swift
a dois produtos públicos.

## 4. Integração de preço Swift

Ao cadastrar ou alterar uma origem, o produto fica `STALE`, com preço legado zero quando ainda não houve confirmação. O sincronizador
`swift-price-sync` consulta somente a URL permitida, compara nome/SKU, confirma
mudanças suspeitas, grava valores monetários em centavos e mantém histórico.
Falhas preservam o último preço confirmado. Campos observados pelo provedor
(preço, promoção, região, hash e datas) não são aceitos da planilha: somente a
Edge Function com service role pode gravá-los.

## 5. Resultado e recuperação

Após o commit, a tela informa quantos itens foram adicionados, substituídos,
ignorados ou desativados e recarrega o catálogo. Em falha, a mensagem indica a
linha ou a chave conflitante e reforça que nenhuma alteração foi aplicada.
Corrija a planilha e execute uma nova importação.
