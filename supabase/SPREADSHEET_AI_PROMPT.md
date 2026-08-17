# Prompt para gerar a planilha de importação

Copie o bloco abaixo para uma IA capaz de criar e anexar arquivos `.xlsx`.
Substitua o conteúdo entre colchetes pelos dados que deseja importar.

```text
Crie e entregue um arquivo Excel binário chamado `catalogo-yourcipe.xlsx`, no
formato `.xlsx` real (não CSV e não apenas uma tabela em Markdown), compatível
com a importação administrativa do Yourcipe.

O arquivo deve possuir exatamente estas três abas, mantendo inclusive as abas
sem dados: `Categorias`, `Produtos` e `Receitas`. Não crie células mescladas,
fórmulas, títulos acima do cabeçalho, linhas de totais, comentários ou abas
adicionais. A primeira linha de cada aba deve conter somente os cabeçalhos
abaixo. Cada registro deve ocupar uma única linha.

ABA `Categorias`
Cabeçalhos, nesta ordem: `tipo`, `nome`
- `tipo` aceita somente: `proteina`, `receita`, `secao_home`, `secao_receita` ou `secao_produto`.
- Use `proteina` para categorias referenciadas por Produtos, `receita` para
  categorias referenciadas por Receitas, `secao_home` para a Home,
  `secao_receita` para tags/seções de receitas e `secao_produto` para produtos.
- Não repita nomes equivalentes, mesmo com diferenças de acento, maiúsculas,
  pontuação ou espaços.

ABA `Produtos`
Cabeçalhos, nesta ordem: `nome`, `categoria`, `unidade`, `imagem`, `swift_url`,
`swift_sku`
- Não inclua a coluna `price`, `preco` ou `preço` para produtos Swift.
- `nome`: obrigatório e único, sem espaços extras.
- `categoria`: obrigatória; deve corresponder exatamente a uma categoria
  `proteina` já existente no Yourcipe ou declarada na aba Categorias.
- `unidade`: obrigatória; use somente `kg`, `un`, `pacote`, `caixa` ou `pote`.
- `imagem`: obrigatória; URL absoluta iniciada por `https://` ou `http://`.
- `swift_url`: obrigatória; URL HTTPS de uma página individual de produto em
  `www.swift.com.br`. Não use busca, categoria, parâmetros (`?`) ou fragmentos
  (`#`). Uma URL não pode aparecer em dois produtos.
- `swift_sku`: preencha quando estiver disponível na página oficial. Não invente
  o SKU e não repita um SKU em produtos diferentes; deixe a célula vazia quando
  não for possível confirmá-lo.
- O preço ficará ausente até o Yourcipe consultar e confirmar a página Swift.
  Não estime, copie ou invente preços.

ABA `Receitas`
Cabeçalhos, nesta ordem: `nome`, `categoria`, `tempo`, `porcoes`,
`dificuldade`, `imagem`, `tags`, `ingredientes`, `extras`, `modoPreparo`, `dicas`
- `nome`: obrigatório e único.
- `categoria`: deve corresponder a uma categoria `receita` existente ou
  declarada na aba Categorias.
- `tempo`: inteiro em minutos, zero ou maior.
- `porcoes`: inteiro, zero ou maior.
- `dificuldade`: somente `Fácil`, `Médio` ou `Difícil`.
- `imagem`: URL absoluta opcional.
- `tags`: valores separados por vírgula. Valores nativos permitidos:
  `destaque`, `recomendado`, `pratico`, `ocasiao`, `rapido`, `churrasco` e
  `petisco`; uma seção nova precisa ser declarada como `secao_receita` em Categorias.
- `ingredientes`: obrigatório. Formato `Nome exato do produto:quantidade`, com
  itens separados por ponto e vírgula. Exemplo:
  `Picanha Swift:1.5; Sal Grosso Swift:0.2`. Use ponto como decimal e quantidade
  maior que zero. Todo produto deve existir ou estar na aba Produtos.
- `extras`: itens opcionais separados por ponto e vírgula.
- `modoPreparo`: obrigatório; passos separados por ponto e vírgula.
- `dicas`: itens opcionais separados por ponto e vírgula.

Antes de gerar o arquivo, valide:
1. que as três abas existem e os cabeçalhos estão escritos exatamente como
   especificado;
2. que não há duplicatas por nome, `swift_url` ou `swift_sku`;
3. que todas as categorias e ingredientes referenciados existem;
4. que nenhum produto Swift contém preço;
5. que todas as URLs Swift são páginas HTTPS oficiais e individuais;
6. que o total não excede 5.000 linhas e o arquivo não excede 10 MB.

Dados a transformar em planilha:
[COLE AQUI AS CATEGORIAS, OS PRODUTOS COM URLs OFICIAIS DA SWIFT E AS RECEITAS]

Ao terminar, anexe somente o arquivo `catalogo-yourcipe.xlsx` e apresente, fora
do arquivo, um resumo curto da quantidade de linhas por aba e dos campos que
ficaram vazios por falta de fonte confiável. Não invente informações ausentes.
```

## Observação sobre preço

O modelo oficial baixado pelo Yourcipe também omite a coluna de preço dos
produtos Swift. Embora o importador reconheça `price` em arquivos antigos, esse
campo é opcional e exclusivamente legado: ele não confirma preço Swift, não
cria histórico e não muda o produto para `CURRENT`.
