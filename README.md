# Mania de Pizza — sistema de gestão

Painel do administrador/caixa, app do garçom e do entregador (web responsivo, instalável no celular), tela da cozinha e API.

| Pasta | O que é |
|---|---|
| `api/` | API Node 22 + Fastify + PostgreSQL (SQL puro, sem ORM) + Socket.IO (tempo real) |
| `web-admin/` | Painel: painel do dia, mesas, pedidos, novo pedido, caixa, entregas, cardápio, usuários, configurações, relatórios e **/cozinha** (tela da TV) |
| `web-garcom/` | App de celular (PWA): mesas, pedido com observação livre por item, pedir a conta, prontos para servir; visão do entregador |
| `shared/` | Tipos, formatação em R$, cliente da API, tempo real, estilos e componentes comuns |

## Rodando localmente

Precisa de Node 20+ e um PostgreSQL.

```bash
npm install
cp .env.example .env            # ajuste DATABASE_URL etc. (ou exporte as variáveis)
# API (cria as tabelas sozinha ao subir):
DATABASE_URL=postgres://... SEED_DEMO=true ADMIN_PASSWORD=admin123 npm run dev:api
npm run dev:admin               # http://localhost:5173
npm run dev:garcom              # http://localhost:5174
```

Com `SEED_DEMO=true` o sistema cria 5 mesas, 4 bairros, um cardápio **de exemplo (preços fictícios — ajuste em Cardápio)** e usuários de teste
`caixa`, `garcom`, `cozinha`, `entregador`, `autonomo` (senha `mania123`). O administrador é `admin` com a senha de `ADMIN_PASSWORD`
(se não definir, uma senha aleatória aparece uma única vez no log da API).

Testes da API (precisam de um Postgres vazio — **apaga o schema `public` do banco indicado**):

```bash
DATABASE_URL=postgres://usuario@localhost:5432/mania_test npm test
```

## Deploy no Render

1. Suba este repositório no GitHub.
2. No Render: **New → Blueprint** e escolha o repositório (usa o `render.yaml`): cria o Postgres, a API e os dois sites.
3. Defina `ADMIN_PASSWORD` na API.
4. Depois que as URLs existirem: em `mania-admin` e `mania-garcom` defina `VITE_API_URL` = URL da API (ex.: `https://mania-api.onrender.com`) e refaça o deploy; na API defina `CORS_ORIGIN` = as URLs dos dois sites separadas por vírgula.
5. Entre no painel com `admin`, cadastre o cardápio, bairros e usuários (garçom, caixa, entregadores, cozinha).

Observação: no plano gratuito a API "dorme" após alguns minutos sem uso (a primeira abertura demora) e o Postgres gratuito expira; para uso real em loja, use planos pagos.

## Como o sistema funciona (resumo)

- **Valores** em centavos no banco; **pizzas** só nos tamanhos **G e GG**; meio a meio cobra o sabor mais caro ou a média (Configurações).
- **Observação** é texto livre por item (e opcional no pedido todo) e aparece na tela da cozinha.
- **Mesas**: o primeiro pedido abre a conta; novos pedidos entram na mesma conta; o garçom pede a conta, o caixa cobra (pode dividir em formas de pagamento e dar desconto com motivo). Dá para transferir, juntar e reservar mesas.
- **Cozinha**: tela `/cozinha` no painel (sem impressora) com aviso sonoro de pedido novo.
- **Entrega**: pedido com endereço e bairro (taxa por bairro); o caixa escolhe o entregador (funcionário ou autônomo) → "saiu para entrega" → "entregue". Se o cliente paga na entrega, o pagamento é lançado sozinho quando o entregador marca "Entreguei" (com o caixa aberto).
- **Caixa**: abertura com troco, sangria/suprimento/despesa, fechamento com conferência do dinheiro contado × esperado. Pagamentos só com caixa aberto.
- **Cancelamentos** exigem motivo e ficam registrados (`audit_logs`).
- **Garçom offline**: pedidos feitos sem internet ficam numa fila no aparelho e são reenviados sozinhos (sem duplicar).
- Não inclui (por decisão): nota fiscal, taxa de serviço, impressora. WhatsApp é a fase 2.
