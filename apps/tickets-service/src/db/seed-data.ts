import type { Article, Category, Employee, Impact, Priority, TicketEventKind, TicketStatus, TicketType } from "../domain/types";

/**
 * Dados de exemplo (Anexo B). As datas são relativas ao momento do seed,
 * para que "vencido" e "resolvido há 4 dias" continuem verdadeiros em
 * qualquer dia em que o projeto for rodado.
 */

export const EMPLOYEES: Employee[] = [
  { email: "ana.souza@nexo.com.br", name: "Ana Souza", department: "Financeiro", role: "employee", device: "Notebook Dell Latitude · Windows 11" },
  { email: "carla.mendes@nexo.com.br", name: "Carla Mendes", department: "Comercial", role: "employee", device: "Notebook Lenovo ThinkPad · Windows 11" },
  { email: "bruno.tavares@nexo.com.br", name: "Bruno Tavares", department: "Marketing", role: "employee", device: "MacBook Pro · macOS" },
  { email: "diego.ramos@nexo.com.br", name: "Diego Ramos", department: "Operações", role: "employee", device: "Desktop HP · Windows 10" },
  { email: "elisa.prado@nexo.com.br", name: "Elisa Prado", department: "RH", role: "employee", device: "Notebook Dell Latitude · Windows 11" },
  { email: "fabio.nunes@nexo.com.br", name: "Fábio Nunes", department: "Jurídico", role: "employee", device: "Notebook Dell Vostro · Windows 10" },
  { email: "gabriela.rocha@nexo.com.br", name: "Gabriela Rocha", department: "Logística", role: "employee", device: "Notebook Lenovo IdeaPad · Windows 11" },
  { email: "rafael.lima@nexo.com.br", name: "Rafael Lima", department: "Suporte N2", role: "analyst", device: null },
  { email: "juliana.costa@nexo.com.br", name: "Juliana Costa", department: "Suporte N1", role: "analyst", device: null },
];

type SeedEvent = { kind: TicketEventKind; actor: string; message: string; daysAgo: number };

export type SeedTicket = {
  number: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  impact: Impact;
  requesterEmail: string;
  status: TicketStatus;
  createdDaysAgo: number;
  lastSupportUpdateDaysAgo: number;
  resolvedDaysAgo: number | null;
  assignee: string | null;
  events: SeedEvent[];
};

const ANA = "ana.souza@nexo.com.br";

export const TICKETS: SeedTicket[] = [
  {
    number: "INC-20311",
    type: "INC",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.",
    category: "Hardware",
    priority: "media",
    impact: "individual",
    requesterEmail: ANA,
    status: "aguardando_analista",
    createdDaysAgo: 12,
    lastSupportUpdateDaysAgo: 6,
    resolvedDaysAgo: null,
    assignee: null,
    events: [
      { kind: "criado", actor: ANA, message: "Chamado aberto pelo Nexo Assist.", daysAgo: 12 },
      { kind: "atualizacao_suporte", actor: "juliana.costa@nexo.com.br", message: "Encaminhado para o Suporte N2 avaliar o driver de vídeo.", daysAgo: 6 },
    ],
  },
  {
    number: "INC-20298",
    type: "INC",
    title: "Acesso à pasta Financeiro no SharePoint",
    description: "Preciso de permissão de edição na pasta Financeiro/Fechamento do SharePoint.",
    category: "Acesso",
    priority: "media",
    impact: "individual",
    requesterEmail: ANA,
    status: "em_andamento",
    createdDaysAgo: 14,
    lastSupportUpdateDaysAgo: 1,
    resolvedDaysAgo: null,
    assignee: "juliana.costa@nexo.com.br",
    events: [
      { kind: "criado", actor: ANA, message: "Chamado aberto.", daysAgo: 14 },
      { kind: "atualizacao_suporte", actor: "juliana.costa@nexo.com.br", message: "Aguardando aprovação do gestor da área.", daysAgo: 1 },
    ],
  },
  {
    number: "REQ-10442",
    type: "REQ",
    title: "Segundo monitor para home office",
    description: "Solicito um segundo monitor para trabalhar em casa.",
    category: "Hardware",
    priority: "baixa",
    impact: "individual",
    requesterEmail: ANA,
    status: "aprovado",
    createdDaysAgo: 19,
    lastSupportUpdateDaysAgo: 7,
    resolvedDaysAgo: null,
    assignee: "juliana.costa@nexo.com.br",
    events: [
      { kind: "criado", actor: ANA, message: "Requisição aberta.", daysAgo: 19 },
      { kind: "status", actor: "juliana.costa@nexo.com.br", message: "Requisição aprovada. Aguardando compra.", daysAgo: 7 },
    ],
  },
  {
    number: "INC-20150",
    type: "INC",
    title: "Senha do SAP bloqueada",
    description: "Errei a senha do SAP algumas vezes e o usuário foi bloqueado.",
    category: "Acesso",
    priority: "media",
    impact: "individual",
    requesterEmail: ANA,
    status: "resolvido",
    createdDaysAgo: 5,
    lastSupportUpdateDaysAgo: 4,
    resolvedDaysAgo: 4,
    assignee: "juliana.costa@nexo.com.br",
    events: [
      { kind: "criado", actor: ANA, message: "Chamado aberto.", daysAgo: 5 },
      { kind: "status", actor: "juliana.costa@nexo.com.br", message: "Usuário desbloqueado. Resolvido.", daysAgo: 4 },
    ],
  },
  {
    number: "INC-19877",
    type: "INC",
    title: "Outlook não sincroniza no celular",
    description: "O e-mail corporativo parou de sincronizar no celular.",
    category: "E-mail",
    priority: "baixa",
    impact: "individual",
    requesterEmail: ANA,
    status: "resolvido",
    createdDaysAgo: 60,
    lastSupportUpdateDaysAgo: 56,
    resolvedDaysAgo: 56,
    assignee: "juliana.costa@nexo.com.br",
    events: [{ kind: "status", actor: "juliana.costa@nexo.com.br", message: "Perfil reconfigurado. Resolvido.", daysAgo: 56 }],
  },
  {
    number: "INC-19410",
    type: "INC",
    title: "Troca de senha da rede",
    description: "Senha da rede expirada.",
    category: "Acesso",
    priority: "media",
    impact: "individual",
    requesterEmail: ANA,
    status: "resolvido",
    createdDaysAgo: 110,
    lastSupportUpdateDaysAgo: 109,
    resolvedDaysAgo: 109,
    assignee: "juliana.costa@nexo.com.br",
    events: [{ kind: "status", actor: "juliana.costa@nexo.com.br", message: "Senha redefinida. Resolvido.", daysAgo: 109 }],
  },
  // Chamados de outros funcionários: existem para provar que nunca vazam para a Ana.
  {
    number: "INC-20412",
    type: "INC",
    title: "Sem acesso ao SAP — perfil de vendas",
    description: "Não consigo acessar o módulo de vendas do SAP. Tenho fechamento com cliente hoje.",
    category: "Acesso",
    priority: "alta",
    impact: "individual",
    requesterEmail: "carla.mendes@nexo.com.br",
    status: "aguardando_analista",
    createdDaysAgo: 0,
    lastSupportUpdateDaysAgo: 0,
    resolvedDaysAgo: null,
    assignee: null,
    events: [{ kind: "criado", actor: "carla.mendes@nexo.com.br", message: "Chamado aberto.", daysAgo: 0 }],
  },
  {
    number: "INC-20380",
    type: "INC",
    title: "Impressora do 2º andar não imprime",
    description: "A impressora do 2º andar fica com os trabalhos presos na fila.",
    category: "Hardware",
    priority: "media",
    impact: "equipe",
    requesterEmail: "diego.ramos@nexo.com.br",
    status: "em_andamento",
    createdDaysAgo: 2,
    lastSupportUpdateDaysAgo: 1,
    resolvedDaysAgo: null,
    assignee: "rafael.lima@nexo.com.br",
    events: [{ kind: "criado", actor: "diego.ramos@nexo.com.br", message: "Chamado aberto.", daysAgo: 2 }],
  },
  {
    number: "REQ-10460",
    type: "REQ",
    title: "Licença do Adobe Creative Cloud",
    description: "Preciso da licença do Creative Cloud para as peças da campanha.",
    category: "Software",
    priority: "baixa",
    impact: "individual",
    requesterEmail: "bruno.tavares@nexo.com.br",
    status: "em_andamento",
    createdDaysAgo: 3,
    lastSupportUpdateDaysAgo: 2,
    resolvedDaysAgo: null,
    assignee: "juliana.costa@nexo.com.br",
    events: [{ kind: "criado", actor: "bruno.tavares@nexo.com.br", message: "Requisição aberta.", daysAgo: 3 }],
  },
];

export const ARTICLES: Article[] = [
  {
    id: "KB-001",
    title: "VPN com erro 809",
    body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    category: "Rede e VPN",
    tags: ["vpn", "erro 809", "809", "windows 10", "conexão remota"],
  },
  {
    id: "KB-002",
    title: "Horário do service desk",
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    category: "Outros",
    tags: ["horário", "atendimento", "plantão", "expediente"],
  },
  {
    id: "KB-003",
    title: "Trocar ou desbloquear a senha da rede",
    body: "Acesse senha.nexo.com.br, informe seu e-mail corporativo e confirme o código enviado ao celular cadastrado. A nova senha vale para rede, e-mail e VPN em até 15 minutos. Se o celular cadastrado mudou, abra um chamado.",
    category: "Acesso",
    tags: ["senha", "rede", "bloqueio", "desbloquear", "expirada", "resetar"],
  },
  {
    id: "KB-004",
    title: "Wi-Fi corporativo e de visitantes",
    body: "Funcionários usam a rede NEXO-CORP com o e-mail e a senha da rede. Visitantes usam NEXO-GUEST; a senha do dia fica na recepção.",
    category: "Rede e VPN",
    tags: ["wi-fi", "wifi", "internet", "visitante", "rede sem fio"],
  },
  {
    id: "KB-005",
    title: "E-mail corporativo no celular",
    body: "Instale o Outlook pela loja do celular, entre com o e-mail corporativo e aprove o acesso no app de autenticação. Se não sincronizar, remova a conta e adicione de novo.",
    category: "E-mail",
    tags: ["outlook", "celular", "e-mail", "sincronizar", "mobile"],
  },
  {
    id: "KB-006",
    title: "Instalar a impressora do andar",
    body: "Abra o portal de softwares, procure 'Impressoras Nexo' e instale a do seu andar. Se os trabalhos ficarem presos na fila, reinicie o spooler pelo mesmo portal.",
    category: "Hardware",
    tags: ["impressora", "imprimir", "fila", "spooler"],
  },
  {
    id: "KB-007",
    title: "Pedir instalação de software",
    body: "Softwares do catálogo são instalados pelo portal de softwares, sem chamado. Softwares fora do catálogo ou que exigem licença paga precisam de uma requisição com a aprovação do gestor.",
    category: "Software",
    tags: ["software", "instalar", "programa", "licença", "catálogo"],
  },
  {
    id: "KB-008",
    title: "Notebook lento após atualização",
    body: "Reinicie o notebook duas vezes e rode o 'Diagnóstico Nexo' pelo portal de softwares. Se a lentidão continuar depois disso, abra um chamado informando o resultado do diagnóstico.",
    category: "Hardware",
    tags: ["lento", "lentidão", "travando", "atualização", "notebook", "desempenho"],
  },
  {
    id: "KB-009",
    title: "Configurar a autenticação em dois fatores",
    body: "No primeiro acesso, instale o app de autenticação e leia o QR code exibido. Trocou de celular? Abra um chamado de Acesso para resetar o MFA.",
    category: "Acesso",
    tags: ["mfa", "dois fatores", "2fa", "autenticador", "qr code", "celular novo"],
  },
];
