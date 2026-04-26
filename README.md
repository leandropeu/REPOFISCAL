# RepoFiscal

Sistema web para o departamento fiscal com gestao de fornecedores, profissionais, unidades, contratos, AVCB, CLCB e notas fiscais.

## Stack

- Backend: FastAPI + `sqlite3`
- Frontend: React + Vite
- Banco de dados: SQLite
- Autenticacao: login com sessao persistida na tabela `sessions`

## Estrutura

```text
backend/
  app/
frontend/
README.md
```

## Backend

1. Instale as dependencias na pasta local do projeto:

```powershell
& "C:\Users\PCHOME1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m pip install -r backend\requirements.txt --target backend\.deps
```

2. Execute a API:

```powershell
& ".\backend\start_backend.ps1" -Port 8010
```

## Frontend

1. Instale as dependencias:

```powershell
cd frontend
npm.cmd install
```

2. Execute a interface:

```powershell
cd frontend
npm.cmd run dev
```

## Login inicial

- Superadm: `superadm@repofiscal.local` / `super123`
- Adm: `adm@repofiscal.local` / `adm123`
- Operador: `operador@repofiscal.local` / `operador123`

## Funcionalidades entregues

- Login e autenticacao persistidos no banco
- Aba de usuarios com perfis `operator`, `adm` e `superadm`
- Cadastro de fornecedores de servicos e produtos
- Cadastro de profissionais vinculado aos fornecedores
- Cadastro de unidades
- Gestao de contratos com vencimento monitorado
- Modulos laterais de AVCB e CLCB com pedidos, documentos e datas de validade
- Gestao de notas fiscais com contratos vinculados
- Aba de arquivos com upload e download de PDF, CSV, XML e Excel
- Vinculo de arquivos com fornecedor, unidade, contrato, nota fiscal e documento regulatorio
- Dashboard com indicadores e listas prioritarias
- Aba de relatorios com extracao em CSV e JSON
- Filtros avancados em relatorios por periodo, unidade, fornecedor, status e tipo de relatorio
- Aba operacional para visualizar logs e estado dos backups
- Trilho de auditoria no banco para login, logout, cadastros, edicoes, exclusoes, uploads e backup manual
- Relatorio rapido em todos os modais com historico relacionado e processos em transito
- Rotina de logs com arquivo rotativo em `LOGS/repofiscal.log`
- Rotina de backup horario em `BKP/repofiscal-hourly-backups.zip`
- Retencao automatica dos ultimos 10 dias dentro de um unico arquivo zip
- Classificacao visual de vencimentos:
  - Verde para registros em dia
  - Amarelo para vencimentos em ate 60 dias
  - Vermelho para registros vencidos
- Interface responsiva com navegacao por abas

## Logs e backup

- Os logs da aplicacao sao gravados automaticamente em `LOGS/repofiscal.log`
- Cada requisicao HTTP e eventos de inicializacao, backup e erro ficam registrados
- A tabela `audit_logs` guarda o historico das principais acoes de usuario e operacao
- O backup e verificado automaticamente a cada minuto e executado no maximo uma vez por hora
- Os snapshots sao armazenados em um unico arquivo `BKP/repofiscal-hourly-backups.zip`
- O zip mantem apenas os backups das ultimas 240 horas (10 dias)
- Cada snapshot inclui banco SQLite, uploads e logs
- O frontend possui uma aba `Operacoes` para acompanhar logs recentes e executar backup manual
- A aba `Relatorios` permite filtrar os dados antes da extracao e gera arquivos com contexto de filtros aplicados
