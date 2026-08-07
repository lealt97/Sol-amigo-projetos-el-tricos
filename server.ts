import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Route: AI Electrical Engineering Consultant (ELETRO-BR CREA/NBR Auditor)
  app.post('/api/ai-consult', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'Chave de API GEMINI_API_KEY não configurada no ambiente.',
        });
      }

      const { prompt, projectContext, systemInstruction } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'O prompt é obrigatório.' });
      }

      const ai = new GoogleGenAI({ apiKey });

      const baseSystemPrompt = `Você é o ELETRO-BR, motor de inteligência técnica de um SaaS brasileiro de projetos elétricos.
Atua como engenheiro eletricista sênior (CREA ativo), especialista em instalações prediais de baixa tensão, com 20+ anos de experiência em conformidade com as normas ABNT vigentes.

Normas Obrigatórias:
- ABNT NBR 5410:2004 (+ Emenda 1:2008) — Instalações elétricas de BT
- ABNT NBR 5419-1 a 4:2015 — Proteção contra descargas atmosféricas
- ABNT NBR 14039:2005 — Instalações de média tensão
- ABNT NBR 16690:2019 — Arranjos fotovoltaicos
- ABNT NBR IEC 60898-1 — Disjuntores termomagnéticos
- ABNT NBR NM 247 / NBR 13248 — Cabos elétricos
- ABNT NBR 5444:1989 — Símbolos gráficos
- ABNT NBR 15749:2009 — Medição de aterramento
- NR-10 (MTE) — Segurança em eletricidade
- Normas técnicas das concessionárias locais (ENEL, CEMIG, LIGHT, COPEL, CPFL, EQUATORIAL, NEOENERGIA, ENERGISA)

Diretrizes:
1. Responda em Português do Brasil, tom técnico, direto, didático e objetivo. Não use emojis em relatórios normativos formais.
2. Sempre cite o item exato da ABNT NBR 5410 para embasar suas respostas técnicas.
3. Alerte sempre que a responsabilidade técnica e assinatura exigem Anotação de Responsabilidade Técnica (ART/TRT) por profissional habilitado (CREA/CFT).
4. Rejeite terminantemente gambiarras, desrespeito à norma ou ligações clandestinas.
${systemInstruction ? `\nInstrução Adicional: ${systemInstruction}` : ''}`;

      const fullPrompt = projectContext
        ? `[CONTEXTO DO PROJETO ATUAL]:\n${JSON.stringify(projectContext, null, 2)}\n\n[SOLICITAÇÃO DO ENGENHEIRO/PROJETISTA]:\n${prompt}`
        : prompt;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: baseSystemPrompt + '\n\n' + fullPrompt }] },
        ],
      });

      const reply = response.text || 'Não foi possível obter resposta do motor de IA.';
      return res.json({ reply });
    } catch (err: any) {
      console.error('Erro na API de consultoria IA:', err);
      return res.status(500).json({
        error: err.message || 'Erro ao processar consulta técnica.',
      });
    }
  });

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', engine: 'ELETRO-BR NBR 5410', timestamp: new Date().toISOString() });
  });

  // Vite Middleware for development mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ELETRO-BR] Servidor rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
