# Prompt para gerar a planilha normalizada

```text
Crie `catalogo-yourcipe.xlsx` real, sem fórmulas, células mescladas ou títulos extras. Inclua exatamente seis abas, mesmo que alguma fique sem dados:
1. Categorias: cabeçalhos `tipo`, `nome`; tipo somente `receita` ou `proteina`.
2. Produtos: `nome`, `categoria`, `unidade`, `imagem`, `swift_url`, `swift_sku`. Unidade: kg, un, pacote, caixa ou pote. swift_url deve ser uma página HTTPS individual de www.swift.com.br.
3. Receitas: `nome`, `categoria`, `tempo`, `porcoes`, `dificuldade`, `imagem`, `destaque`, `ingredientes`, `extras`, `modoPreparo`, `dicas`. Destaque é true/false. Ingredientes: `Produto:quantidade`, separados por `;`.
4. Seções: `pagina`, `secao`, `ordem`, `ativa`. Página somente home, recipes ou products; ordem é inteiro >= 0; ativa é true/false. O mesmo nome pode ocorrer em páginas distintas.
5. Receitas por Seção: `pagina`, `secao`, `receita`, `ordem`; página somente home ou recipes.
6. Produtos por Seção: `pagina`, `secao`, `produto`, `ordem`; página somente products.

Valide todas as referências, duplicatas compostas por página+seção+conteúdo, URLs, ordens e o limite total de 5.000 linhas. Não use secao_*, tipo secao, nem tags para posicionamento; não invente dados ou preços. Demonstre uma receita na Home e em Recipes, a mesma receita em duas seções, e um produto em Products.
```

Arquivos legados devem ser migrados explicitamente: linhas `secao_*` vão para `Seções`, associações vão para as abas relacionais e apenas `destaque` vira a coluna booleana.
