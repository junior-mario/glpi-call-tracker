import { useState, useEffect, useRef } from "react";

const MOCK_DATA = {
  periodo: "01/01/2026 – 28/02/2026",
  total_chamados: 287,
  resolvidos_no_prazo: 201,
  outliers_criticos: 23,
  tempo_medio_geral_horas: 8.4,
  categorias: [
    { nome: "Acesso / Permissões", qtd: 74, mediana: 3.2, p90: 28.4, outliers: 8, tecnicos: ["Natan", "Lucas", "Fernanda"] },
    { nome: "Rede / VPN", qtd: 58, mediana: 1.8, p90: 12.1, outliers: 3, tecnicos: ["Natan", "Carlos"] },
    { nome: "Hardware", qtd: 47, mediana: 18.6, p90: 96.3, outliers: 7, tecnicos: ["Lucas", "Fernanda"] },
    { nome: "Software / Sistema", qtd: 61, mediana: 5.4, p90: 48.2, outliers: 4, tecnicos: ["Carlos", "Natan"] },
    { nome: "Impressora", qtd: 28, mediana: 4.1, p90: 22.7, outliers: 1, tecnicos: ["Fernanda", "Lucas"] },
    { nome: "E-mail / Office", qtd: 19, mediana: 2.9, p90: 9.8, outliers: 0, tecnicos: ["Carlos"] },
  ],
  tecnicos: [
    { nome: "Natan Bortolossi", chamados: 89, tempo_medio: 5.2, no_prazo: 82, outliers: 4 },
    { nome: "Lucas Andrade",    chamados: 76, tempo_medio: 11.3, no_prazo: 58, outliers: 9 },
    { nome: "Fernanda Souza",   chamados: 68, tempo_medio: 7.8, no_prazo: 55, outliers: 6 },
    { nome: "Carlos Mendes",    chamados: 54, tempo_medio: 6.1, no_prazo: 46, outliers: 4 },
  ],
  outliers: [
    { id: 11102, categoria: "Acesso / Permissões", tecnico: "Lucas Andrade", tempo_total: 187, fase_critica: "Aprovação", provavel_causa: "Solicitante não respondeu por 6 dias", resumo: "Liberação de acesso ao sistema ERP para novo colaborador" },
    { id: 11154, categoria: "Hardware", tecnico: "Fernanda Souza", tempo_total: 142, fase_critica: "Resolução", provavel_causa: "Aguardou compra de peça (HD externo)", resumo: "Notebook com HD com falha — troca necessária" },
    { id: 11198, categoria: "Software / Sistema", tecnico: "Lucas Andrade", tempo_total: 128, fase_critica: "Triagem", provavel_causa: "Chamado ficou sem atribuição por 3 dias", resumo: "Erro ao abrir sistema de NF-e" },
    { id: 11211, categoria: "Acesso / Permissões", tecnico: "Lucas Andrade", tempo_total: 115, fase_critica: "Aprovação", provavel_causa: "Dependência de aprovação do gestor (RH)", resumo: "Acesso ao servidor de arquivos do setor Fiscal" },
    { id: 11230, categoria: "Hardware", tecnico: "Lucas Andrade", tempo_total: 98, fase_critica: "Resolução", provavel_causa: "Suporte do fornecedor externo demorou 4 dias", resumo: "Impressora multifuncional com defeito de hardware" },
    { id: 11244, categoria: "Acesso / Permissões", tecnico: "Fernanda Souza", tempo_total: 91, fase_critica: "Triagem", provavel_causa: "Alta demanda no período — fila longa", resumo: "Reset de senha do AD para colaborador remoto" },
  ],
  tendencia_semanal: [
    { semana: "S1 Jan", abertos: 38, fechados: 35, media_horas: 6.1 },
    { semana: "S2 Jan", abertos: 42, fechados: 39, media_horas: 7.4 },
    { semana: "S3 Jan", abertos: 31, fechados: 34, media_horas: 5.8 },
    { semana: "S4 Jan", abertos: 45, fechados: 38, media_horas: 9.2 },
    { semana: "S1 Fev", abertos: 39, fechados: 42, media_horas: 8.1 },
    { semana: "S2 Fev", abertos: 52, fechados: 44, media_horas: 11.3 },
    { semana: "S3 Fev", abertos: 40, fechados: 55, media_horas: 9.7 },
  ],
  similares_divergentes: [
    { tipo: "Reset de senha AD", casos: [{ id: 11089, horas: 0.8, tecnico: "Natan" }, { id: 11233, horas: 74.2, tecnico: "Lucas" }] },
    { tipo: "Acesso VPN remoto", casos: [{ id: 11104, horas: 1.2, tecnico: "Carlos" }, { id: 11219, horas: 68.5, tecnico: "Fernanda" }] },
  ],
  diagnostico_ia: `**Principais achados do período:**

O volume de chamados cresceu 37% na S2 de Fevereiro sem aumento proporcional de resolução, gerando fila acumulada. A categoria Acesso/Permissões concentra o maior número de outliers (8), com padrão recorrente de atraso na fase de **aprovação pelo gestor** — não há SLA definido para essa etapa.

Hardware apresenta o maior tempo médio (P90 de 96h), motivado principalmente por **dependência de compra de material** e suporte de fornecedores externos.

Lucas Andrade registra 9 outliers no período — proporcionalmente acima dos pares — com 3 casos de chamados sem atribuição por mais de 2 dias, sugerindo necessidade de revisão da fila ou capacitação.

**Recomendações prioritárias:**
1. Definir SLA de resposta para aprovações de gestor (sugestão: 24h úteis)
2. Manter estoque mínimo de peças críticas (HD, memória RAM)
3. Implementar alerta automático para chamados sem movimentação > 48h
4. Revisar distribuição de chamados para Lucas no próximo sprint`
};

const fmtH = h => h < 24 ? `${h.toFixed(1)}h` : `${(h/24).toFixed(1)}d`;
const pct = (a,b) => Math.round((a/b)*100);

const BAR_COLORS = ["#6366f1","#8b5cf6","#a78bfa","#c4b5fd","#ddd6fe","#e0e7ff"];
const RISK_COLOR = h => h > 96 ? "#ef4444" : h > 48 ? "#f97316" : h > 24 ? "#eab308" : "#22c55e";

function KpiCard({ label, value, sub, color = "#6366f1" }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "18px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderLeft: `4px solid ${color}`, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function HBarChart({ data, valueKey, labelKey, colorFn }) {
  const max = Math.max(...data.map(d => d[valueKey]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 130, fontSize: 12, color: "#374151", textAlign: "right", flexShrink: 0 }}>{d[labelKey]}</div>
          <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 22, overflow: "hidden" }}>
            <div style={{ width: `${(d[valueKey]/max)*100}%`, height: "100%", background: colorFn ? colorFn(d[valueKey]) : BAR_COLORS[i % BAR_COLORS.length], borderRadius: 4, transition: "width .5s", display: "flex", alignItems: "center", paddingLeft: 8 }}>
              <span style={{ fontSize: 11, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtH(d[valueKey])}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", width: 30 }}>p90</div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data }) {
  const W = 560, H = 140, PAD = 40;
  const maxV = Math.max(...data.map(d => Math.max(d.abertos, d.fechados)));
  const x = i => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const y = v => H - PAD - (v / maxV) * (H - PAD * 2);
  const line = key => data.map((d,i) => `${i===0?"M":"L"}${x(i)},${y(d[key])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }}>
      {[0,.5,1].map(t => (
        <line key={t} x1={PAD} x2={W-PAD} y1={y(maxV*t)} y2={y(maxV*t)} stroke="#e5e7eb" strokeDasharray="4" />
      ))}
      <path d={line("abertos")} fill="none" stroke="#6366f1" strokeWidth={2.5} strokeLinejoin="round" />
      <path d={line("fechados")} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinejoin="round" />
      {data.map((d,i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.abertos)} r={4} fill="#6366f1" />
          <circle cx={x(i)} cy={y(d.fechados)} r={4} fill="#22c55e" />
          <text x={x(i)} y={H-8} textAnchor="middle" fontSize={10} fill="#9ca3af">{d.semana}</text>
        </g>
      ))}
    </svg>
  );
}

function Badge({ text, color }) {
  const map = { red: ["#fef2f2","#ef4444"], orange: ["#fff7ed","#f97316"], yellow: ["#fefce8","#ca8a04"], green: ["#f0fdf4","#16a34a"], purple: ["#f5f3ff","#7c3aed"] };
  const [bg, fg] = map[color] || map.purple;
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{text}</span>;
}

const TABS = ["Visão Geral", "Por Categoria", "Por Técnico", "Outliers", "Tendência", "Diagnóstico IA"];

export default function App() {
  const [tab, setTab] = useState(0);
  const d = MOCK_DATA;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#f9fafb", minHeight: "100vh", padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111" }}>Análise de Chamados</h1>
          <span style={{ fontSize: 13, color: "#6b7280", background: "#e5e7eb", padding: "2px 10px", borderRadius: 20 }}>{d.periodo}</span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af" }}>Análise estratégica gerada por IA · {d.total_chamados} chamados processados</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#e5e7eb", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            style={{ padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab===i?600:400,
              background: tab===i?"#fff":"transparent", color: tab===i?"#4f46e5":"#6b7280",
              boxShadow: tab===i?"0 1px 3px rgba(0,0,0,.1)":"none", transition: "all .15s" }}>
            {t}
          </button>
        ))}
      </div>

      {/* === VISÃO GERAL === */}
      {tab === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <KpiCard label="Total de Chamados" value={d.total_chamados} sub="no período" color="#6366f1" />
            <KpiCard label="Resolvidos no Prazo" value={`${pct(d.resolvidos_no_prazo, d.total_chamados)}%`} sub={`${d.resolvidos_no_prazo} chamados`} color="#22c55e" />
            <KpiCard label="Tempo Médio" value={fmtH(d.tempo_medio_geral_horas)} sub="abertura → fechamento" color="#f59e0b" />
            <KpiCard label="Outliers Críticos" value={d.outliers_criticos} sub="> 2× mediana da categoria" color="#ef4444" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#374151" }}>P90 por Categoria (horas)</h3>
              <HBarChart data={d.categorias} valueKey="p90" labelKey="nome" colorFn={RISK_COLOR} />
            </div>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#374151" }}>Performance dos Técnicos</h3>
              {d.tecnicos.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < d.tecnicos.length-1 ? "1px solid #f3f4f6" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{t.nome}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{t.chamados} chamados · {fmtH(t.tempo_medio)} médio</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Badge text={`${pct(t.no_prazo, t.chamados)}% no prazo`} color={pct(t.no_prazo, t.chamados) >= 80 ? "green" : pct(t.no_prazo, t.chamados) >= 65 ? "yellow" : "red"} />
                    {t.outliers > 0 && <Badge text={`${t.outliers} outliers`} color="orange" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Similares divergentes */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#374151" }}>⚠ Chamados Similares com Tempos Muito Diferentes</h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#9ca3af" }}>Mesmo tipo de solicitação — diferença expressiva no tempo de resolução</p>
            {d.similares_divergentes.map((g, i) => (
              <div key={i} style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 8 }}>{g.tipo}</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {g.casos.map((c, j) => (
                    <div key={j} style={{ fontSize: 12, color: "#374151" }}>
                      <span style={{ color: "#6b7280" }}>#{c.id} ({c.tecnico}):</span>{" "}
                      <strong style={{ color: j===0?"#16a34a":"#ef4444" }}>{fmtH(c.horas)}</strong>
                    </div>
                  ))}
                  <span style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
                    Diferença: {fmtH(Math.max(...g.casos.map(c=>c.horas)) - Math.min(...g.casos.map(c=>c.horas)))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === POR CATEGORIA === */}
      {tab === 1 && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#374151" }}>Métricas por Categoria</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["Categoria","Qtd","Mediana","P90","Outliers","Risco"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.categorias.sort((a,b) => b.p90 - a.p90).map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: i%2===0?"#fff":"#fafafa" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{c.nome}</td>
                  <td style={{ padding: "10px 12px", color: "#374151" }}>{c.qtd}</td>
                  <td style={{ padding: "10px 12px" }}>{fmtH(c.mediana)}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ color: RISK_COLOR(c.p90), fontWeight: 700 }}>{fmtH(c.p90)}</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {c.outliers > 0 ? <Badge text={c.outliers} color={c.outliers >= 6 ? "red" : "orange"} /> : <Badge text="0" color="green" />}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Badge text={c.p90 > 48 ? "Alto" : c.p90 > 24 ? "Médio" : "Baixo"} color={c.p90 > 48 ? "red" : c.p90 > 24 ? "yellow" : "green"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* === POR TÉCNICO === */}
      {tab === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {d.tecnicos.sort((a,b) => a.no_prazo/a.chamados - b.no_prazo/b.chamados).map((t, i) => {
            const pctOk = pct(t.no_prazo, t.chamados);
            return (
              <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#111", marginBottom: 4 }}>{t.nome}</div>
                    <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6b7280" }}>
                      <span>{t.chamados} chamados</span>
                      <span>Tempo médio: <strong style={{ color: "#374151" }}>{fmtH(t.tempo_medio)}</strong></span>
                      <span>Outliers: <strong style={{ color: t.outliers >= 7 ? "#ef4444" : "#374151" }}>{t.outliers}</strong></span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: pctOk >= 80 ? "#16a34a" : pctOk >= 65 ? "#ca8a04" : "#ef4444" }}>{pctOk}%</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>no prazo</div>
                  </div>
                </div>
                <div style={{ marginTop: 14, background: "#f3f4f6", borderRadius: 6, height: 8, overflow: "hidden" }}>
                  <div style={{ width: `${pctOk}%`, height: "100%", background: pctOk >= 80 ? "#22c55e" : pctOk >= 65 ? "#eab308" : "#ef4444", borderRadius: 6, transition: "width .6s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === OUTLIERS === */}
      {tab === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#991b1b" }}>
            ⚠ {d.outliers_criticos} chamados com tempo acima de 2× a mediana da sua categoria. Listados abaixo os de maior impacto.
          </div>
          {d.outliers.map((o, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderLeft: `4px solid ${o.tempo_total > 150 ? "#ef4444" : o.tempo_total > 100 ? "#f97316" : "#eab308"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 4 }}>
                    #{o.id} — {o.resumo}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge text={o.categoria} color="purple" />
                    <Badge text={o.tecnico} color="yellow" />
                    <Badge text={`Fase crítica: ${o.fase_critica}`} color="orange" />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#ef4444" }}>{fmtH(o.tempo_total)}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>tempo total</div>
                </div>
              </div>
              <div style={{ marginTop: 12, background: "#fafafa", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#374151" }}>
                <strong>Provável causa:</strong> {o.provavel_causa}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === TENDÊNCIA === */}
      {tab === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#374151" }}>Abertos vs. Fechados por Semana</h3>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, fontSize: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 3, background: "#6366f1", borderRadius: 2, display: "inline-block" }} /> Abertos</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 3, background: "#22c55e", borderRadius: 2, display: "inline-block" }} /> Fechados</span>
            </div>
            <LineChart data={d.tendencia_semanal} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 600, color: "#374151" }}>Tempo Médio de Resolução por Semana</h3>
            <HBarChart data={d.tendencia_semanal} valueKey="media_horas" labelKey="semana" colorFn={RISK_COLOR} />
          </div>
        </div>
      )}

      {/* === DIAGNÓSTICO IA === */}
      {tab === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)", borderRadius: 12, padding: 20, color: "#fff" }}>
            <div style={{ fontSize: 12, opacity: .8, marginBottom: 4 }}>Gerado por IA · {d.periodo}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Diagnóstico Executivo</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.07)", fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
            {d.diagnostico_ia.split("\n").map((line, i) => {
              if (line.startsWith("**") && line.endsWith("**")) return <h3 key={i} style={{ margin: "16px 0 8px", fontSize: 14, fontWeight: 700, color: "#111" }}>{line.replace(/\*\*/g,"")}</h3>;
              if (line.match(/^\d+\./)) return <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}><span style={{ color: "#6366f1", fontWeight: 700, minWidth: 18 }}>{line.split(".")[0]}.</span><span>{line.slice(line.indexOf(".")+1).trim()}</span></div>;
              if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
              return <p key={i} style={{ margin: "0 0 8px" }}>{line.replace(/\*\*([^*]+)\*\*/g, (_, t) => `<strong>${t}</strong>`)}</p>;
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            {[
              { titulo: "SLA de Aprovação", desc: "Definir prazo máximo de 24h úteis para gestores aprovarem soluções", cor: "#6366f1" },
              { titulo: "Estoque de Peças", desc: "Manter HD, memória e outros itens críticos em estoque mínimo", cor: "#f59e0b" },
              { titulo: "Alerta de Inatividade", desc: "Notificar automaticamente chamados parados há mais de 48h", cor: "#ef4444" },
            ].map((r, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderTop: `3px solid ${r.cor}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>{r.titulo}</div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
