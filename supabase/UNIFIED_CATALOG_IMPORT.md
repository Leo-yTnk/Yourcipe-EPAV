# Importação unificada e normalizada do catálogo (V0.50)

A importação administrativa é uma única chamada transacional à RPC `admin_import_public_catalog`. O arquivo possui **seis abas obrigatórias** (uma aba sem alterações pode ficar vazia):

| Aba | Colunas exatas | Regras principais |
|---|---|---|
| `Categorias` | `tipo`, `nome` | `tipo`: somente `receita` ou `proteina` |
| `Produtos` | `nome`, `categoria`, `unidade`, `imagem`, `swift_url`, `swift_sku` | categoria `proteina`; unidade `kg`, `un`, `pacote`, `caixa` ou `pote` |
| `Receitas` | `nome`, `categoria`, `tempo`, `porcoes`, `dificuldade`, `imagem`, `destaque`, `ingredientes`, `extras`, `modoPreparo`, `dicas` | `destaque` é booleano e não posiciona em seção |
| `Seções` | `pagina`, `secao`, `ordem`, `ativa` | página: `home`, `recipes` ou `products`; identidade = página + slug normalizado |
| `Receitas por Seção` | `pagina`, `secao`, `receita`, `ordem` | página somente `home` ou `recipes` |
| `Produtos por Seção` | `pagina`, `secao`, `produto`, `ordem` | página somente `products` |

`ingredientes` usa `Produto:quantidade`, separado por `;`. Campos de lista (`extras`, `modoPreparo`, `dicas`) também usam `;`. URLs Swift continuam identificando a origem oficial; preço confirmado nunca é substituído pela planilha.

## Exemplo

Declare `Destaques da Semana` e `Direto da Churrasqueira` em `home`, `Receitas na Brasa` em `recipes` e `Carnes Bovinas` em `products`. Vincule `Picanha na Brasa` às duas seções Home e à seção Recipes; vincule `Picanha` apenas à seção Products. O modelo baixável contém exatamente esse cenário e categorias taxonômicas separadas.

## Validação, modos e atomicidade

Navegador e servidor validam página, ordem não negativa, ativo booleano, referências a seção/conteúdo e vínculos duplicados. Seções com o mesmo slug em páginas diferentes são válidas. Todas as referências podem apontar para registros existentes ou declarados no arquivo.

Cada grupo possui `add`, `upsert` e `replace_all`: categorias, produtos, receitas, seções, vínculos de receita e vínculos de produto. Em `replace_all`, seções são comparadas somente dentro de cada página presente; vínculos são removidos somente da página/tipo pertinente. As páginas fixas nunca são desativadas. Autenticação, `is_admin()`, `security definer`, `search_path` vazio e grants mínimos protegem a RPC. Qualquer exceção reverte todos os seis grupos.

## Migração do legado

`secao_home`, `secao_receita` e `secao_produto` não são mais categorias. A coluna `tags` não posiciona receitas. Planilhas legadas são rejeitadas explicitamente, pois uma conversão silenciosa seria ambígua. Mova cada seção para `Seções`, cada associação para a aba relacional correta e converta somente `destaque` para a coluna booleana. A organização visual passa exclusivamente por `catalog_sections`, `catalog_section_recipes` e `catalog_section_products`.
