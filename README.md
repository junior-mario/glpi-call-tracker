# GLPI Call Tracker

Aplicação web para acompanhamento de chamados do GLPI em tempo real. Permite rastrear tickets, visualizar timelines, monitorar grupos e acompanhar produtividade via dashboard.

## Arquitetura

```
┌──────────────────────┐         ┌────────────────────────┐
│  Frontend (Nginx)    │──/api──>│  Backend (Node.js)     │
│  React SPA  :80      │         │  Express + SQLite :3000 │
└──────────────────────┘         └────────────────────────┘
                                          │
                                     /data/db.sqlite
                                  (volume persistente)
```

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui
- **Backend**: Express.js, better-sqlite3, JWT (jsonwebtoken + bcryptjs)
- **Infraestrutura**: Docker Compose com 2 containers (Nginx + Node.js)
- **Banco de dados**: SQLite com 3 tabelas (`users`, `glpi_configs`, `tracked_tickets`)

## Estrutura de Pastas

```
glpi-call-tracker/
├── server/                  # Backend Express
│   ├── index.js             # Servidor (auth, config GLPI, tickets CRUD)
│   ├── package.json         # Dependencias do backend
│   └── Dockerfile           # Imagem Node 20 Alpine
├── src/                     # Frontend React
│   ├── components/          # Componentes reutilizaveis (UI, cards, badges)
│   ├── contexts/            # AuthContext (autenticacao via JWT)
│   ├── lib/
│   │   ├── api.ts           # Cliente HTTP com JWT automatico
│   │   └── utils.ts         # Utilitarios
│   ├── pages/
│   │   ├── Index.tsx        # Pagina principal (tickets rastreados)
│   │   ├── Monitor.tsx      # Monitoramento de grupo (busca por periodo)
│   │   ├── Dashboard.tsx    # Dashboard de produtividade
│   │   ├── Settings.tsx     # Configuracao da API GLPI
│   │   ├── Login.tsx        # Tela de login
│   │   └── Register.tsx     # Tela de cadastro
│   ├── services/
│   │   └── glpiService.ts   # Integracao com API GLPI
│   └── types/               # Tipos TypeScript
├── docker-compose.yml       # Orquestracao dos containers
├── Dockerfile               # Build do frontend (Nginx)
├── nginx.conf               # Proxy /api para o backend
└── .env.example             # Variaveis de ambiente
```

## Rotas da API

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/auth/register` | Cadastro de usuario (retorna token + user) |
| POST | `/api/auth/login` | Login (retorna token + user) |
| GET | `/api/auth/me` | Valida token e retorna usuario atual |
| GET | `/api/glpi-config` | Retorna configuracao GLPI do usuario |
| PUT | `/api/glpi-config` | Cria/atualiza configuracao GLPI |
| DELETE | `/api/glpi-config` | Remove configuracao GLPI |
| GET | `/api/tracked-tickets` | Lista tickets rastreados |
| POST | `/api/tracked-tickets` | Adiciona/atualiza ticket rastreado |
| PATCH | `/api/tracked-tickets/:ticketId` | Atualiza campos do ticket |
| DELETE | `/api/tracked-tickets/:ticketId` | Remove ticket do rastreamento |

---

## Deploy com Docker Compose (Producao)

### Pre-requisitos

- Docker e Docker Compose instalados

### Passos

1. Clone o repositorio:

```bash
git clone <URL_DO_REPO>
cd glpi-call-tracker
```

2. Crie o arquivo `.env` na raiz com um segredo JWT seguro:

```bash
JWT_SECRET=meu-segredo-super-forte-aqui
```

3. Suba os containers:

```bash
docker-compose up -d --build
```

4. A aplicacao estara disponivel em `http://localhost:80`.

### Persistencia

O banco de dados SQLite fica no volume Docker `db-data`, montado em `/data/db.sqlite` dentro do container do backend. Os dados persistem mesmo ao recriar os containers.

Para fazer backup do banco:

```bash
docker cp $(docker-compose ps -q backend):/data/db.sqlite ./backup-db.sqlite
```

### Atualizacao

```bash
git pull
docker-compose up -d --build
```

Os dados do banco sao preservados entre atualizacoes (volume persistente).

---

## Desenvolvimento Local

### Pre-requisitos

- Node.js 18+ e npm

### Passos

1. Instale as dependencias do frontend e backend:

```bash
npm install
cd server && npm install && cd ..
```

2. Inicie o backend (terminal 1):

```bash
cd server
node index.js
```

O backend roda na porta **3000**. O banco SQLite sera criado automaticamente em `server/data/db.sqlite`.

3. Inicie o frontend (terminal 2):

```bash
npm run dev
```

O frontend roda na porta **8080** e faz proxy automatico de `/api` para `localhost:3000` (configurado no `vite.config.ts`).

4. Acesse `http://localhost:8080`.

### Variaveis de ambiente opcionais (`.env`)

```bash
# Proxy para GLPI em dev (evita CORS) — opcional se configurar pela interface
VITE_GLPI_URL=https://seu-servidor-glpi.com
VITE_GLPI_APP_TOKEN=seu-app-token
VITE_GLPI_USER_TOKEN=seu-user-token
```

---

## Cadastro de Usuarios

O cadastro de usuarios e feito diretamente pela interface da aplicacao. **Nao e necessario nenhum setup manual no banco de dados.**

### Como cadastrar

1. Acesse a aplicacao no navegador.
2. Na tela de login, clique em **"Criar Conta"** (ou acesse `/register`).
3. Preencha email e senha (minimo 6 caracteres).
4. Clique em **"Criar Conta"**.
5. O login e feito automaticamente apos o cadastro — voce sera redirecionado para a pagina principal.

### Notas sobre autenticacao

- A autenticacao usa **JWT** (JSON Web Token) com validade de **30 dias**.
- O token e armazenado no `localStorage` do navegador.
- As senhas sao armazenadas com hash **bcrypt** (nunca em texto puro).
- Se o token expirar, o usuario sera redirecionado automaticamente para a tela de login.
- Cada usuario tem sua propria configuracao GLPI e seus proprios tickets rastreados — os dados sao isolados por usuario.

### Gerenciamento de usuarios

Nao existe painel administrativo. Para gerenciar usuarios manualmente (por exemplo, remover um usuario), voce pode acessar o banco SQLite diretamente:

```bash
# Em desenvolvimento
sqlite3 server/data/db.sqlite

# Em Docker
docker-compose exec backend sh
sqlite3 /data/db.sqlite
```

Comandos uteis:

```sql
-- Listar todos os usuarios
SELECT id, email, created_at FROM users;

-- Remover um usuario (cascata remove configs e tickets dele)
DELETE FROM users WHERE email = 'usuario@email.com';
```

---

## Configuracao do GLPI

Apos fazer login, acesse **Configuracoes** na barra de navegacao e preencha:

- **URL Base**: URL do seu servidor GLPI (ex: `https://glpi.empresa.com`)
- **App Token**: Encontrado em *Configuracao > Geral > API > Token de aplicacao cliente*
- **User Token**: Encontrado em *Minhas configuracoes > Controle remoto > Token de acesso pessoal*

Voce pode testar a conexao antes de salvar.
