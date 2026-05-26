# AGENTS.md

## Objetivo
Este repositório contém uma aplicação já em funcionamento. Toda nova funcionalidade deve ser implementada respeitando a arquitetura existente, reaproveitando integrações, serviços, layout e padrões já estabelecidos.

## Regras de trabalho
- Antes de editar, sempre mapear onde a funcionalidade equivalente já existe.
- Reaproveitar integrações existentes sempre que possível.
- Não criar fluxos paralelos se já houver uma base funcional no projeto.
- Não trocar arquitetura, framework ou bibliotecas centrais sem necessidade real.
- Preferir extensões pequenas e seguras ao invés de grandes refatorações.
- Toda regra de negócio nova deve ficar centralizada em um local próprio.
- Toda lógica de integração externa deve ser reutilizada ou encapsulada de forma consistente com o projeto.
- Toda feature nova deve ter logging mínimo útil.
- Toda feature nova deve ter testes nas regras críticas.
- Evitar dependências novas pesadas.

## Para o módulo Monitor de Chamados
- O projeto já possui consulta manual de chamados. Reutilize isso.
- Não duplique autenticação no GLPI.
- Não crie uma segunda implementação paralela de ticket.
- O módulo deve ser acoplado ao app existente como extensão natural.
- Priorize V1 baseada em regras objetivas.
- IA deve ser opcional e não obrigatória nesta fase.
- Persistir histórico de análises é obrigatório.
- O módulo deve ser preparado para futura evolução com alertas externos.

## Estilo de implementação
- Código legível e modular.
- Nomes claros.
- Separar bem: coleta, consolidação, regras, persistência, scheduler e UI.
- Documentar decisões não óbvias em comentários curtos.
- Evitar abstrações excessivas sem ganho real.

## Entrega
Sempre informar:
- arquivos alterados
- arquivos novos
- decisões importantes
- riscos conhecidos
- próximos passos recomendados