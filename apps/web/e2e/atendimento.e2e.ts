import { expect, test, type Browser, type Page } from "@playwright/test";

async function login(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByPlaceholder("seu.nome@nexo.com.br").fill(email);
  await page.locator('input[autocomplete="current-password"]').fill("nexo123");
  await page.getByRole("button", { name: "Entrar" }).click();
  return page;
}

async function send(page: Page, text: string) {
  await page.getByPlaceholder(/Escreva para/).fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
}

test("funcionária abre um chamado, pede um analista e recebe a resposta dele", async ({ browser }) => {
  const ana = await login(browser, "ana.souza@nexo.com.br");
  await expect(ana).toHaveURL(/\/atendimento/);
  await expect(ana.getByRole("heading", { name: "Olá, Ana. Como posso ajudar?" })).toBeVisible();

  await send(ana, "O Excel fecha sozinho quando abro planilhas grandes");
  await expect(ana.getByText("Quem está sendo afetado?")).toBeVisible();
  await ana.getByRole("button", { name: "Só eu" }).click();
  await expect(ana.getByText("Excel fecha sozinho ao abrir planilhas grandes").first()).toBeVisible();
  await expect(ana.getByText(/média/i).first()).toBeVisible();

  await ana.getByText("por que respondi assim").last().click();
  await expect(ana.getByText(/Prioridade média/).first()).toBeVisible();
  await expect(ana.getByText(/só é criado depois que você confirmar/).first()).toBeVisible();

  await ana.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(ana.getByText(/INC-\d+/).first()).toBeVisible();

  await send(ana, "Quero falar com um analista");
  await expect(ana.getByRole("banner").getByText("Aguardando analista")).toBeVisible();

  await send(ana, "Estou no ramal 4321");
  await expect(ana.getByText("Estou no ramal 4321")).toBeVisible();
  await expect(ana.getByRole("banner").getByText("Aguardando analista")).toBeVisible();

  const rafael = await login(browser, "rafael.lima@nexo.com.br");
  await expect(rafael).toHaveURL(/\/console/);
  await rafael.getByText("Ana Souza").first().click();
  await expect(rafael.getByText("Funcionário pediu um analista").first()).toBeVisible();
  await rafael.getByRole("button", { name: "Assumir atendimento" }).click();

  await rafael.getByPlaceholder("Responder para Ana…").fill("Oi, Ana! Vou olhar seu Excel agora.");
  await rafael.getByPlaceholder("Responder para Ana…").press("Enter");

  await expect(ana.getByText("Oi, Ana! Vou olhar seu Excel agora.")).toBeVisible();
  await expect(ana.getByRole("banner").getByText("Com um analista")).toBeVisible();

  await rafael.getByRole("button", { name: "Devolver ao agent" }).first().click();
  await expect(ana.getByRole("banner").getByText("Assistente online")).toBeVisible();
});

test("funcionária não acessa o console do analista", async ({ browser }) => {
  const ana = await login(browser, "ana.souza@nexo.com.br");
  await expect(ana).toHaveURL(/\/atendimento/);
  await ana.goto("/console");
  await expect(ana).not.toHaveURL(/\/console/);
});
