# Auditoria: seleção em lote e planilha de produtos (2026-08-19)

## Git e publicação

O clone entregue não possuía remoto configurado nem referência `main`; continha apenas o branch `work` em `f5e9a01`. Esse commit é o squash do GitHub, com a mesma mensagem do trabalho anterior, e altera `app.js`, `template.js` e `styles.css`. O objeto `7d622cf` não existe neste clone, portanto a equivalência foi verificada pelo conteúdo e pela mensagem, não pelo hash.

O conteúdo anterior estava no snapshot: seleção de categorias, barras contextuais de receitas/produtos/registros, opção persistida `spreadsheet` e o esqueleto da tabela. Porém, o release manteve o mesmo identificador de cache `20260817-7` apesar de alterar JavaScript e CSS. Como `index.html` documenta que esse identificador deve mudar em toda publicação com JavaScript alterado, navegadores/CDNs podiam continuar servindo os assets anteriores. Nesta correção ele foi atualizado de forma atômica para `20260819-1`.

## Falhas funcionais encontradas

* A planilha anterior era somente leitura, embora o requisito fosse edição rápida.
* As linhas recebiam `nome` e `tempoLabel`, mas a tabela tentava renderizar `name` e `priceLabel`; portanto as células podiam ficar vazias.
* Produtos repetidos em mais de uma seção viravam linhas duplicadas.
* O salvamento de preço aceitava formatos ambíguos/mais de duas casas, não informava sucesso e não recarregava o catálogo público.
* A UI não respeitava a Swift como fonte de verdade ao decidir se o preço podia ser editado.
* A exclusão em lote de categorias chamava o `delete` genérico em vez do RPC transacional com verificação de referências e limpava toda a seleção mesmo em falha parcial.
* Não havia testes específicos do fluxo incorporado no squash.

## Rotas e componentes efetivamente usados

`renderApp` direciona as telas administrativas para `renderSiteRecipesTab`, `renderSiteProductsTab`, `renderSiteCategoriesTab`, `renderMyRecipesTab`, `renderMyProductsTab` e `renderMyCategoriesTab`. Registros usa `renderSalesHistory`. A página pública de produtos usa `renderProducts`, que agora chama a planilha editável para administradores, mantendo leitura para usuários comuns e para preços Swift.

Não foram encontradas fontes Arial na aplicação. O reset global aplica Inter a elementos e pseudoelementos; os formulários, selects, modais e controles do Modo de Criação usam `var(--font-sans)` e os tokens globais. Fontes técnicas dentro do bundle de terceiros não foram modificadas.

## Política de preço

Produtos com `swift_product_url` ou `price_source === 'SWIFT'` ficam somente leitura na planilha. Produtos legados sem origem Swift podem ser editados por administradores; o valor é validado como moeda BRL, salvo pelo endpoint existente `updateSiteProduct`, e os catálogos administrativo e público são recarregados. Assim, uma sincronização Swift não sobrescreve silenciosamente uma edição local oferecida pela interface.

## Limitações do ambiente

Não foi possível fazer `fetch/pull` nem criar um PR remoto porque o clone não possui `origin`. A referência local `main` foi estabelecida no snapshot squash `f5e9a01`, e o trabalho foi feito no novo branch `fix/bulk-selection-product-spreadsheet-audit`.
