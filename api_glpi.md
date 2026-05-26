# Guia da API do GLPI para Agentes de IA

Este documento fornece instruções detalhadas sobre como interagir com a API do GLPI. Use este guia para executar operações programáticas no sistema GLPI.

## Índice
1. [Visão Geral](#visão-geral)
2. [Configuração Inicial](#configuração-inicial)
3. [Autenticação](#autenticação)
4. [Operações Básicas](#operações-básicas)
5. [Busca e Filtros](#busca-e-filtros)
6. [Exemplos Práticos](#exemplos-práticos)
7. [Tratamento de Erros](#tratamento-de-erros)
8. [Referência Rápida](#referência-rápida)

---

## Visão Geral

### Duas APIs Disponíveis

**1. REST API (Legacy API)**
- Endpoint base: `https://seu-glpi.com/apirest.php`
- Disponível em: GLPI 9.x até 11.x
- Autenticação: App Token + User Token ou Login/Senha
- Nível: Baixo nível (acesso direto aos recursos)

**2. High-Level API (HLAPI)**
- Endpoint base: `https://seu-glpi.com/api.php`
- Disponível em: GLPI 11.x+
- Autenticação: OAuth 2.0
- Nível: Alto nível (interface simplificada)
- Swagger UI: `https://seu-glpi.com/api.php/doc`

### Quando Usar Cada API

| Cenário | API Recomendada |
|---------|----------------|
| Integração com GLPI 9.x ou 10.x | REST API |
| GLPI 11.x - Projeto novo | HLAPI |
| GLPI 11.x - Manter compatibilidade | REST API |
| Autenticação simplificada (OAuth) | HLAPI |
| Acesso granular a todos os recursos | REST API |

---

## Configuração Inicial

### Informações Necessárias

Para usar qualquer API do GLPI, você precisa obter do usuário:

1. **URL do GLPI**: `https://glpi.exemplo.com`
2. **Para REST API**:
   - `app_token`: Token da aplicação (configurado em Configuração > API)
   - `user_token`: Token pessoal do usuário (encontrado em Preferências do usuário)
   - OU `username` e `password`
3. **Para HLAPI**:
   - `client_id`: ID do cliente OAuth
   - `client_secret`: Secret do cliente OAuth
   - `username` e `password` (para grant type "password")
   - `scope`: Escopos necessários (ex: "api user")

### Validação de URL

Antes de fazer chamadas, normalize a URL:

```python
def normalize_glpi_url(url: str, api_type: str = "rest") -> str:
    """
    Normaliza a URL do GLPI para o tipo de API especificado.
    
    Args:
        url: URL base do GLPI (ex: "https://glpi.exemplo.com")
        api_type: "rest" para REST API ou "hl" para HLAPI
    
    Returns:
        URL completa do endpoint da API
    """
    # Remove trailing slash
    url = url.rstrip('/')
    
    # Remove endpoint se já estiver presente
    url = url.replace('/apirest.php', '').replace('/api.php', '')
    
    # Adiciona endpoint apropriado
    if api_type == "rest":
        return f"{url}/apirest.php"
    elif api_type == "hl":
        return f"{url}/api.php"
    else:
        raise ValueError("api_type deve ser 'rest' ou 'hl'")
```

---

## Autenticação

### REST API - Método 1: User Token

**Passo 1: Iniciar Sessão**
```http
GET /apirest.php/initSession
Headers:
  Authorization: user_token {USER_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json
```

**Resposta de Sucesso:**
```json
{
  "session_token": "83af7e620c83a50a18d3eac2f6ed05a3ca0bea62"
}
```

**Passo 2: Armazenar Session Token**

Guarde o `session_token` retornado. Use-o em todas as próximas requisições:
```http
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json
```

**Passo 3: Finalizar Sessão (Sempre fazer ao terminar)**
```http
GET /apirest.php/killSession
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
```

### REST API - Método 2: Login/Senha

**Passo 1: Criar Basic Auth**
```python
import base64

def create_basic_auth(username: str, password: str) -> str:
    """Cria string Basic Auth codificada."""
    credentials = f"{username}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"
```

**Passo 2: Iniciar Sessão**
```http
GET /apirest.php/initSession
Headers:
  Authorization: {BASIC_AUTH_STRING}
  App-Token: {APP_TOKEN}
  Content-Type: application/json
```

### HLAPI - OAuth 2.0

**Grant Type: Password (Mais comum)**

```http
POST /api.php/token
Content-Type: application/x-www-form-urlencoded

Body:
grant_type=password
client_id={CLIENT_ID}
client_secret={CLIENT_SECRET}
username={USERNAME}
password={PASSWORD}
scope=api user
```

**Resposta de Sucesso:**
```json
{
  "token_type": "Bearer",
  "expires_in": 3600,
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "def502003f8b..."
}
```

**Usar o Access Token:**
```http
Headers:
  Authorization: Bearer {ACCESS_TOKEN}
  Content-Type: application/json
```

**Refresh Token (quando expirar):**
```http
POST /api.php/token
Content-Type: application/x-www-form-urlencoded

Body:
grant_type=refresh_token
client_id={CLIENT_ID}
client_secret={CLIENT_SECRET}
refresh_token={REFRESH_TOKEN}
```

---

## Operações Básicas

### Estrutura de ItemTypes

No GLPI, tudo é baseado em "ItemTypes". Principais ItemTypes:

| ItemType | Descrição |
|----------|-----------|
| `Computer` | Computadores |
| `Ticket` | Tickets/Chamados |
| `User` | Usuários |
| `Monitor` | Monitores |
| `Printer` | Impressoras |
| `Phone` | Telefones |
| `NetworkEquipment` | Equipamentos de rede |
| `Software` | Softwares |
| `Contract` | Contratos |
| `Supplier` | Fornecedores |
| `Location` | Localizações |
| `Entity` | Entidades |
| `ITILCategory` | Categorias ITIL |
| `Group` | Grupos |
| `Profile` | Perfis |

### 1. GET - Buscar Item Específico

**REST API:**
```http
GET /apirest.php/{ItemType}/{id}
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}

Exemplo:
GET /apirest.php/Computer/123
GET /apirest.php/Ticket/456
GET /apirest.php/User/789
```

**HLAPI:**
```http
GET /api.php/Assets/{ItemType}/{id}
Headers:
  Authorization: Bearer {ACCESS_TOKEN}

Exemplo:
GET /api.php/Assets/Computer/123
```

**Resposta:**
```json
{
  "id": 123,
  "name": "PC-001",
  "serial": "ABC123456",
  "entities_id": 0,
  "locations_id": 5,
  "date_creation": "2024-01-15 10:30:00",
  "date_mod": "2024-02-01 14:20:00"
}
```

### 2. GET - Listar Múltiplos Items

**REST API:**
```http
GET /apirest.php/{ItemType}?range=0-49
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}

Parâmetros de Query:
  - range: Paginação (ex: 0-49, 50-99)
  - expand_dropdowns: true/false (expande IDs para nomes)
  - get_hateoas: true/false (inclui links HATEOAS)
```

**Exemplo com Paginação:**
```http
GET /apirest.php/Computer?range=0-99&expand_dropdowns=true
```

**Resposta:**
```json
[
  {
    "id": 1,
    "name": "PC-001",
    "serial": "ABC123"
  },
  {
    "id": 2,
    "name": "PC-002",
    "serial": "DEF456"
  }
]
```

### 3. POST - Criar Item

**REST API:**
```http
POST /apirest.php/{ItemType}
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "name": "Novo Item",
    "campo1": "valor1",
    "campo2": "valor2"
  }
}
```

**Criar Múltiplos Items de Uma Vez:**
```json
{
  "input": [
    {
      "name": "Item 1",
      "serial": "SN001"
    },
    {
      "name": "Item 2",
      "serial": "SN002"
    }
  ]
}
```

**Resposta de Sucesso (Item Único):**
```json
{
  "id": 456,
  "message": "Item successfully added: Novo Item"
}
```

**Resposta de Sucesso (Múltiplos Items):**
```json
[
  {
    "id": 456,
    "message": "Item successfully added: Item 1"
  },
  {
    "id": 457,
    "message": "Item successfully added: Item 2"
  }
]
```

### 4. PUT - Atualizar Item

**REST API:**
```http
PUT /apirest.php/{ItemType}/{id}
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "name": "Nome Atualizado",
    "campo_a_atualizar": "novo_valor"
  }
}
```

**⚠️ IMPORTANTE:** Somente os campos enviados serão atualizados. Campos omitidos permanecem inalterados.

**Resposta de Sucesso:**
```json
{
  "456": true,
  "message": "Item successfully updated"
}
```

### 5. DELETE - Deletar Item

**REST API:**

**Etapa 1: Marcar para Deleção (Mover para Lixeira)**
```http
DELETE /apirest.php/{ItemType}/{id}
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
```

**Etapa 2: Deletar Permanentemente (Purge)**
```http
DELETE /apirest.php/{ItemType}/{id}?force_purge=true
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
```

**Resposta de Sucesso:**
```json
{
  "456": true,
  "message": "Item successfully deleted"
}
```

---

## Busca e Filtros

### Listar Opções de Busca

Antes de fazer buscas complexas, descubra quais campos estão disponíveis:

```http
GET /apirest.php/listSearchOptions/{ItemType}
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}

Exemplo:
GET /apirest.php/listSearchOptions/Computer
```

**Resposta:**
```json
{
  "1": {
    "uid": "Computer.name",
    "name": "Name",
    "field": "name",
    "table": "glpi_computers",
    "datatype": "itemlink"
  },
  "2": {
    "uid": "Computer.id",
    "name": "ID",
    "field": "id",
    "table": "glpi_computers",
    "datatype": "number"
  },
  "31": {
    "uid": "Computer.serial",
    "name": "Serial number",
    "field": "serial",
    "table": "glpi_computers",
    "datatype": "string"
  }
}
```

### Busca Avançada

**REST API:**
```http
POST /apirest.php/search/{ItemType}
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "criteria": [
    {
      "field": 1,
      "searchtype": "contains",
      "value": "texto"
    }
  ]
}
```

### Operadores de Busca

| Operador | Descrição | Exemplo |
|----------|-----------|---------|
| `contains` | Contém (wildcard padrão) | "PC" encontra "PC-001", "My-PC" |
| `equals` | Igual (para dropdowns) | Status = "Ativo" |
| `notequals` | Diferente de | Status != "Inativo" |
| `lessthan` | Menor que | ID < 100 |
| `morethan` | Maior que | ID > 50 |
| `under` | Abaixo de (hierarquia) | Entidade sob "Root" |
| `notunder` | Não abaixo de | Entidade não sob "Root" |

### Modificadores de Busca

Use `^` para início exato e `$` para fim exato:

```json
{
  "criteria": [
    {
      "field": 1,
      "searchtype": "contains",
      "value": "^PC-"
    }
  ]
}
```
Encontra: "PC-001", "PC-002"
Não encontra: "MPC-001", "MYPC-001"

### Busca com Múltiplos Critérios

```json
{
  "criteria": [
    {
      "field": 1,
      "searchtype": "contains",
      "value": "PC",
      "link": "AND"
    },
    {
      "field": 31,
      "searchtype": "contains",
      "value": "ABC",
      "link": "AND"
    }
  ]
}
```

**Links disponíveis:** `AND`, `OR`, `AND NOT`, `OR NOT`

### Busca com Ordenação

```json
{
  "criteria": [
    {
      "field": 1,
      "searchtype": "contains",
      "value": ""
    }
  ],
  "sort": 1,
  "order": "DESC",
  "range": "0-49"
}
```

**Parâmetros:**
- `sort`: ID do campo para ordenar
- `order`: `ASC` (crescente) ou `DESC` (decrescente)
- `range`: Paginação (ex: "0-49", "50-99")

---

## Exemplos Práticos

### Exemplo 1: Criar um Ticket

```http
POST /apirest.php/Ticket
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "name": "Computador não liga",
    "content": "O computador da sala 101 não está ligando. Verificamos a fonte e está funcionando.",
    "type": 1,
    "urgency": 3,
    "impact": 3,
    "priority": 3,
    "itilcategories_id": 5,
    "locations_id": 10,
    "entities_id": 0,
    "requesttypes_id": 1
  }
}
```

**Campos Importantes de Ticket:**
- `name`: Título do ticket (obrigatório)
- `content`: Descrição detalhada (obrigatório)
- `type`: 1=Incident, 2=Request
- `urgency`: 1=Muito baixa, 2=Baixa, 3=Média, 4=Alta, 5=Muito alta
- `impact`: 1=Muito baixo, 2=Baixo, 3=Médio, 4=Alto, 5=Muito alto
- `priority`: Calculado automaticamente ou definido manualmente (1-5)
- `itilcategories_id`: ID da categoria do ticket
- `status`: 1=Novo, 2=Processando, 3=Planejado, 4=Pendente, 5=Resolvido, 6=Fechado
- `locations_id`: ID da localização
- `entities_id`: ID da entidade (0 = entidade raiz)
- `requesttypes_id`: Tipo de requisição (1=Helpdesk, 2=Email, etc.)

### Exemplo 2: Adicionar Acompanhamento a um Ticket

```http
POST /apirest.php/Ticket/456/ITILFollowup
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "itemtype": "Ticket",
    "items_id": 456,
    "content": "Verificamos o equipamento e identificamos que a placa-mãe está com defeito. Solicitamos substituição.",
    "is_private": 0
  }
}
```

**Campos:**
- `itemtype`: Sempre "Ticket"
- `items_id`: ID do ticket
- `content`: Texto do acompanhamento
- `is_private`: 0=Público, 1=Privado (somente técnicos)

### Exemplo 3: Adicionar Solução a um Ticket

```http
POST /apirest.php/Ticket/456/ITILSolution
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "itemtype": "Ticket",
    "items_id": 456,
    "content": "Placa-mãe substituída. Computador testado e funcionando normalmente.",
    "solutiontypes_id": 1
  }
}
```

### Exemplo 4: Atualizar Status do Ticket para Resolvido

```http
PUT /apirest.php/Ticket/456
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "status": 5
  }
}
```

**Status de Ticket:**
- 1: Novo
- 2: Processando (atribuído)
- 3: Planejado
- 4: Pendente
- 5: Resolvido
- 6: Fechado

### Exemplo 5: Buscar Tickets Abertos

```http
POST /apirest.php/search/Ticket
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "criteria": [
    {
      "field": 12,
      "searchtype": "equals",
      "value": 1,
      "link": "AND"
    },
    {
      "field": 12,
      "searchtype": "equals",
      "value": 2,
      "link": "OR"
    }
  ],
  "sort": 19,
  "order": "DESC"
}
```

**Explicação:**
- Campo 12: Status
- Valores 1 e 2: Novo ou Processando
- Campo 19: Data de modificação
- Ordena por data mais recente

### Exemplo 6: Criar Computador com Detalhes

```http
POST /apirest.php/Computer
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "name": "PC-ADMIN-001",
    "serial": "SN123456789",
    "otherserial": "TAG-001",
    "entities_id": 0,
    "locations_id": 5,
    "computermodels_id": 10,
    "computertypes_id": 1,
    "manufacturers_id": 2,
    "users_id": 15,
    "groups_id": 3,
    "states_id": 1,
    "comment": "Computador administrativo principal"
  }
}
```

### Exemplo 7: Associar Item a Ticket

```http
POST /apirest.php/Item_Ticket
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "tickets_id": 456,
    "itemtype": "Computer",
    "items_id": 123
  }
}
```

### Exemplo 8: Upload de Documento

```http
POST /apirest.php/Document
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: multipart/form-data

Body (multipart/form-data):
uploadManifest: {
  "input": {
    "name": "Foto do Problema",
    "entities_id": 0,
    "_filename": ["foto.jpg"]
  }
}
filename[0]: [binary file data]
```

### Exemplo 9: Associar Documento a Ticket

```http
POST /apirest.php/Document_Item
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "input": {
    "documents_id": 789,
    "itemtype": "Ticket",
    "items_id": 456
  }
}
```

### Exemplo 10: Buscar Computadores por Localização

```http
POST /apirest.php/search/Computer
Headers:
  Session-Token: {SESSION_TOKEN}
  App-Token: {APP_TOKEN}
  Content-Type: application/json

Body:
{
  "criteria": [
    {
      "field": 3,
      "searchtype": "equals",
      "value": 5
    }
  ],
  "forcedisplay": [1, 2, 31, 3, 5]
}
```

**Explicação:**
- Campo 3: ID da localização
- Valor 5: ID da localização específica
- `forcedisplay`: Campos a exibir (1=Nome, 2=ID, 31=Serial, 3=Localização, 5=Status)

---

## Tratamento de Erros

### Códigos HTTP

| Código | Significado | Ação Recomendada |
|--------|-------------|------------------|
| 200 | OK | Sucesso |
| 201 | Created | Item criado com sucesso |
| 206 | Partial Content | Resposta parcial (range) |
| 400 | Bad Request | Verificar sintaxe do JSON/parâmetros |
| 401 | Unauthorized | Token inválido ou expirado - reautenticar |
| 403 | Forbidden | Usuário sem permissão - verificar perfil |
| 404 | Not Found | Item ou endpoint não encontrado |
| 500 | Internal Server Error | Erro no servidor - verificar logs GLPI |

### Mensagens de Erro Comuns

**REST API:**

```json
{
  "0": "ERROR_SESSION_TOKEN_INVALID",
  "1": "session_token seems invalid"
}
```

**Erros Possíveis:**

| Código de Erro | Descrição | Solução |
|----------------|-----------|---------|
| `ERROR_SESSION_TOKEN_INVALID` | Token de sessão inválido | Fazer novo initSession |
| `ERROR_SESSION_TOKEN_MISSING` | Token não fornecido | Adicionar Session-Token no header |
| `ERROR_WRONG_APP_TOKEN_PARAMETER` | App Token incorreto | Verificar configuração do App Token |
| `ERROR_APP_TOKEN_PARAMETERS_MISSING` | App Token não fornecido | Adicionar App-Token no header |
| `ERROR_NOT_ALLOWED_IP` | IP não autorizado | Configurar IP permitido na API |
| `ERROR_RIGHT_MISSING` | Sem permissão | Verificar perfil do usuário |
| `ERROR_ITEM_NOT_FOUND` | Item não existe | Verificar ID do item |
| `ERROR_ITEMTYPE_NOT_FOUND_NOR_COMMONDBTM` | ItemType inválido | Verificar nome do ItemType |
| `ERROR_GLPI_LOGIN` | Falha no login | Verificar credenciais |
| `ERROR_LOGIN_PARAMETERS_MISSING` | Parâmetros de login faltando | Fornecer user_token ou login/senha |

### Lógica de Retry

Implemente retry para erros temporários:

```python
import time
from typing import Any, Callable

def retry_request(
    func: Callable,
    max_retries: int = 3,
    backoff_factor: float = 2.0,
    retry_codes: list[int] = [500, 502, 503, 504]
) -> Any:
    """
    Tenta executar uma função com retry em caso de erro.
    
    Args:
        func: Função a executar
        max_retries: Número máximo de tentativas
        backoff_factor: Fator de multiplicação do tempo de espera
        retry_codes: Códigos HTTP que devem acionar retry
    
    Returns:
        Resultado da função
    """
    for attempt in range(max_retries):
        try:
            response = func()
            
            # Se for código 401, não faz retry - reautenticar
            if response.status_code == 401:
                raise Exception("Token inválido - necessário reautenticar")
            
            # Se for código que merece retry
            if response.status_code in retry_codes:
                if attempt < max_retries - 1:
                    wait_time = backoff_factor ** attempt
                    time.sleep(wait_time)
                    continue
            
            # Se chegou aqui, retorna resposta
            response.raise_for_status()
            return response
            
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = backoff_factor ** attempt
            time.sleep(wait_time)
```

### Validação de Resposta

Sempre valide as respostas:

```python
def validate_response(response: dict, expected_keys: list[str] = None) -> bool:
    """
    Valida se a resposta da API é válida.
    
    Args:
        response: Resposta JSON da API
        expected_keys: Chaves esperadas na resposta
    
    Returns:
        True se válida, False caso contrário
    """
    # Verifica se é erro
    if isinstance(response, dict):
        # REST API retorna erro como array: ["0": "ERROR_CODE", "1": "message"]
        if "0" in response and "ERROR" in str(response["0"]):
            return False
        
        # HLAPI retorna erro estruturado
        if "status" in response and "ERROR" in response["status"]:
            return False
    
    # Verifica chaves esperadas
    if expected_keys:
        for key in expected_keys:
            if key not in response:
                return False
    
    return True
```

---

## Referência Rápida

### Template de Fluxo Completo (REST API)

```python
import requests
from typing import Optional

class GLPIClient:
    """Cliente simplificado para GLPI REST API."""
    
    def __init__(self, url: str, app_token: str, user_token: str):
        self.base_url = url.rstrip('/').replace('/apirest.php', '') + '/apirest.php'
        self.app_token = app_token
        self.user_token = user_token
        self.session_token: Optional[str] = None
    
    def init_session(self) -> bool:
        """Inicia sessão na API."""
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'user_token {self.user_token}',
            'App-Token': self.app_token
        }
        
        response = requests.get(f'{self.base_url}/initSession', headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            self.session_token = data.get('session_token')
            return True
        
        return False
    
    def get_headers(self) -> dict:
        """Retorna headers para requisições autenticadas."""
        if not self.session_token:
            raise Exception("Sessão não iniciada. Execute init_session() primeiro.")
        
        return {
            'Content-Type': 'application/json',
            'Session-Token': self.session_token,
            'App-Token': self.app_token
        }
    
    def get_item(self, itemtype: str, item_id: int) -> dict:
        """Busca um item específico."""
        url = f'{self.base_url}/{itemtype}/{item_id}'
        response = requests.get(url, headers=self.get_headers())
        response.raise_for_status()
        return response.json()
    
    def get_items(self, itemtype: str, range_start: int = 0, range_end: int = 49) -> list:
        """Lista múltiplos items com paginação."""
        url = f'{self.base_url}/{itemtype}'
        params = {'range': f'{range_start}-{range_end}'}
        response = requests.get(url, headers=self.get_headers(), params=params)
        response.raise_for_status()
        return response.json()
    
    def create_item(self, itemtype: str, data: dict) -> dict:
        """Cria um novo item."""
        url = f'{self.base_url}/{itemtype}'
        payload = {'input': data}
        response = requests.post(url, headers=self.get_headers(), json=payload)
        response.raise_for_status()
        return response.json()
    
    def update_item(self, itemtype: str, item_id: int, data: dict) -> dict:
        """Atualiza um item existente."""
        url = f'{self.base_url}/{itemtype}/{item_id}'
        payload = {'input': data}
        response = requests.put(url, headers=self.get_headers(), json=payload)
        response.raise_for_status()
        return response.json()
    
    def delete_item(self, itemtype: str, item_id: int, force_purge: bool = False) -> dict:
        """Deleta um item."""
        url = f'{self.base_url}/{itemtype}/{item_id}'
        params = {'force_purge': 'true'} if force_purge else {}
        response = requests.delete(url, headers=self.get_headers(), params=params)
        response.raise_for_status()
        return response.json()
    
    def search(self, itemtype: str, criteria: list) -> dict:
        """Realiza busca avançada."""
        url = f'{self.base_url}/search/{itemtype}'
        payload = {'criteria': criteria}
        response = requests.post(url, headers=self.get_headers(), json=payload)
        response.raise_for_status()
        return response.json()
    
    def kill_session(self) -> bool:
        """Finaliza sessão."""
        if not self.session_token:
            return True
        
        response = requests.get(f'{self.base_url}/killSession', headers=self.get_headers())
        self.session_token = None
        return response.status_code == 200
    
    def __enter__(self):
        """Context manager - entrada."""
        self.init_session()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager - saída."""
        self.kill_session()


# Uso:
with GLPIClient(
    url='https://glpi.exemplo.com',
    app_token='seu_app_token',
    user_token='seu_user_token'
) as glpi:
    
    # Buscar computador
    computer = glpi.get_item('Computer', 123)
    print(f"Computador: {computer['name']}")
    
    # Criar ticket
    ticket = glpi.create_item('Ticket', {
        'name': 'Problema de rede',
        'content': 'Sem acesso à internet',
        'type': 1,
        'urgency': 3
    })
    print(f"Ticket criado: {ticket['id']}")
    
    # Buscar tickets abertos
    results = glpi.search('Ticket', [
        {
            'field': 12,
            'searchtype': 'equals',
            'value': 2
        }
    ])
```

### Checklist de Implementação

Ao implementar integração com GLPI, siga este checklist:

- [ ] **1. Obter Credenciais**
  - [ ] URL do GLPI
  - [ ] App Token (REST API)
  - [ ] User Token ou Login/Senha (REST API)
  - [ ] Client ID e Secret (HLAPI)

- [ ] **2. Configurar Autenticação**
  - [ ] Implementar initSession (REST API)
  - [ ] Implementar OAuth token request (HLAPI)
  - [ ] Armazenar tokens de forma segura
  - [ ] Implementar refresh token (HLAPI)

- [ ] **3. Implementar Operações Básicas**
  - [ ] GET item
  - [ ] GET lista de items
  - [ ] POST criar item
  - [ ] PUT atualizar item
  - [ ] DELETE remover item

- [ ] **4. Tratamento de Erros**
  - [ ] Validar códigos HTTP
  - [ ] Tratar erros específicos da API
  - [ ] Implementar retry logic
  - [ ] Logs de erro detalhados

- [ ] **5. Finalização**
  - [ ] Implementar killSession (REST API)
  - [ ] Limpar tokens ao finalizar
  - [ ] Context managers para gerenciar sessão

- [ ] **6. Testes**
  - [ ] Testar autenticação
  - [ ] Testar CRUD completo
  - [ ] Testar tratamento de erros
  - [ ] Testar paginação
  - [ ] Testar busca avançada

### Campos de Busca Comuns

**Ticket (campo: ID):**
- 1: Nome
- 2: ID
- 12: Status
- 15: Data de abertura
- 19: Data de modificação
- 21: Prioridade
- 3: Urgência
- 4: Impacto
- 7: Categoria
- 8: Requerente

**Computer (campo: ID):**
- 1: Nome
- 2: ID
- 3: Localização
- 4: Tipo
- 5: Modelo
- 23: Fabricante
- 31: Serial
- 45: Sistema Operacional

**User (campo: ID):**
- 1: Nome
- 2: ID
- 5: Email
- 6: Telefone
- 8: Localização

### Mapeamento de Valores

Quando criar ou atualizar, use IDs numéricos:

```json
{
  "type": 1,          // 1=Incident, 2=Request
  "urgency": 3,       // 1-5 (1=Muito baixa, 5=Muito alta)
  "impact": 3,        // 1-5
  "priority": 3,      // 1-5
  "status": 2         // 1=Novo, 2=Processando, etc.
}
```

Para descobrir IDs de categorias, localizações, etc., use:

```http
GET /apirest.php/{ItemType}?expand_dropdowns=false

Exemplos:
GET /apirest.php/ITILCategory
GET /apirest.php/Location
GET /apirest.php/Entity
```

---

## Recursos Adicionais

### Documentação Oficial
- **Developer Docs**: https://glpi-developer-documentation.readthedocs.io/
- **GitHub**: https://github.com/glpi-project/glpi
- **Fórum**: https://forum.glpi-project.org/

### Bibliotecas Oficiais
- **PHP**: https://github.com/glpi-project/php-library-glpi
- **Python**: https://di.pages.unistra.fr/glpi/python-glpi-api/

### Dicas Finais

1. **Sempre use HTTPS** em produção
2. **Nunca exponha tokens** em logs ou código público
3. **Implemente rate limiting** para evitar sobrecarga
4. **Use paginação** para grandes conjuntos de dados
5. **Sempre finalize sessões** (killSession) para economizar recursos
6. **Cache resultados** quando apropriado
7. **Monitore logs do GLPI** (files/_log) para debug
8. **Teste em ambiente de desenvolvimento** primeiro

### Exemplo de Fluxo Completo de Ticket

```python
# 1. Criar ticket
ticket = glpi.create_item('Ticket', {
    'name': 'Problema crítico',
    'content': 'Servidor principal fora do ar',
    'type': 1,
    'urgency': 5,
    'impact': 5,
    'priority': 5,
    'itilcategories_id': 5
})
ticket_id = ticket['id']

# 2. Associar equipamento ao ticket
glpi.create_item('Item_Ticket', {
    'tickets_id': ticket_id,
    'itemtype': 'Computer',
    'items_id': 123
})

# 3. Adicionar acompanhamento
glpi.create_item(f'Ticket/{ticket_id}/ITILFollowup', {
    'content': 'Investigando a causa raiz',
    'is_private': 0
})

# 4. Adicionar solução
glpi.create_item(f'Ticket/{ticket_id}/ITILSolution', {
    'content': 'Servidor reiniciado com sucesso',
    'solutiontypes_id': 1
})

# 5. Atualizar status para resolvido
glpi.update_item('Ticket', ticket_id, {
    'status': 5
})

# 6. Fechar ticket
glpi.update_item('Ticket', ticket_id, {
    'status': 6
})
```

---

## Conclusão

Este guia fornece todas as informações necessárias para interagir com a API do GLPI. Use-o como referência ao desenvolver integrações, sempre consultando a documentação oficial para detalhes específicos da versão em uso.

**Lembre-se:**
- Autentique-se antes de qualquer operação
- Valide todas as respostas
- Trate erros adequadamente
- Finalize sessões após o uso
- Mantenha credenciais seguras

Boa sorte com sua integração GLPI! 🚀
