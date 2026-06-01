import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const requiredFields = [
  { key: 'businessSphere', label: 'Сфера бизнеса', aliases: ['сфера', 'бизнес', 'компания', 'отрасль'] },
  { key: 'employeesCount', label: 'Количество сотрудников', aliases: ['сотрудник', 'человек', 'штат'] },
  { key: 'implementationGoal', label: 'Основная задача внедрения', aliases: ['задача', 'внедрение', 'нужно', 'навести порядок'] },
  { key: 'processType', label: 'Продажи или внутренние процессы', aliases: ['продаж', 'внутренн', 'процесс'] },
  { key: 'productionOrProjects', label: 'Производство/проекты', aliases: ['производ', 'проект'] },
  { key: 'currentCrm', label: 'Наличие текущей CRM', aliases: ['crm', 'срм', 'excel', 'эксель'] },
  { key: 'mainPain', label: 'Основная боль клиента', aliases: ['боль', 'проблем', 'теря', 'хаос'] },
  { key: 'budget', label: 'Бюджет', aliases: ['бюджет', 'руб', 'деньги'] },
  { key: 'decisionMaker', label: 'ЛПР или нет', aliases: ['лпр', 'решение', 'руководитель', 'директор'] },
  { key: 'urgency', label: 'Срочность запуска', aliases: ['срок', 'срочно', 'месяц', 'запуск'] },
  { key: 'meetingConsent', label: 'Согласие на встречу', aliases: ['встреч', 'созвон', 'соглас'] },
];

const questionsByField = {
  businessSphere: 'В какой сфере работает ваша компания и какой продукт или услугу продаёте?',
  employeesCount: 'Сколько сотрудников будет работать в Битрикс24 на первом этапе?',
  implementationGoal: 'Какую основную задачу внедрения Битрикс24 вы хотите решить в первую очередь?',
  processType: 'Это больше про продажи, сервис или внутренние процессы компании?',
  productionOrProjects: 'У вас есть проектное управление или производственный контур, который тоже нужно учитывать?',
  currentCrm: 'Сейчас используете CRM, Excel или другой инструмент для ведения заявок?',
  mainPain: 'Можете обозначить самую сильную боль, которая сейчас есть?',
  budget: 'Какой ориентир по бюджету вы готовы рассматривать для запуска?',
  decisionMaker: 'Вы самостоятельно принимаете решение по внедрению или нужно подключить ещё кого-то?',
  urgency: 'В какие сроки хотите запустить рабочий контур?',
  meetingConsent: 'Готовы назначить встречу, чтобы разобрать процесс и предложить план внедрения?',
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, ai: openai ? 'openai' : 'rule-based-fallback' });
});

app.post('/api/analyze', async (request, response) => {
  const transcript = Array.isArray(request.body.transcript) ? request.body.transcript : [];
  const fallbackAnalysis = buildRuleBasedAnalysis(transcript);

  if (!openai) {
    response.json({ analysis: fallbackAnalysis, source: 'rule-based-fallback' });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: JSON.stringify({ transcript, requiredFields }, null, 2) },
      ],
    });
    const analysis = JSON.parse(completion.choices[0].message.content);
    response.json({ analysis: normalizeAnalysis(analysis, fallbackAnalysis), source: 'openai' });
  } catch (error) {
    response.json({ analysis: fallbackAnalysis, source: 'rule-based-fallback', warning: error.message });
  }
});

app.post('/api/finalize', (request, response) => {
  const transcript = Array.isArray(request.body.transcript) ? request.body.transcript : [];
  const analysis = request.body.analysis || buildRuleBasedAnalysis(transcript);
  const discovered = analysis.discovered || {};
  const clientSummary = transcript
    .filter((replica) => replica.speaker === 'client')
    .map((replica) => replica.text)
    .join(' ');

  response.json({
    bitrix24Payload: {
      UF_CRM_BUSINESS_SPHERE: discovered.businessSphere || '',
      UF_CRM_EMPLOYEES_COUNT: discovered.employeesCount || '',
      UF_CRM_MAIN_PAIN: discovered.mainPain || '',
      UF_CRM_BUDGET: discovered.budget || '',
      UF_CRM_DECISION_MAKER: discovered.decisionMaker || '',
      UF_CRM_URGENCY: discovered.urgency || '',
      COMMENTS: buildCallOutcome(analysis, clientSummary),
      OPPORTUNITY_PROBABILITY: analysis.meetingProbability || 0,
      NEXT_STEP: analysis.nextBestQuestion || '',
      SOURCE_ID: 'AI_LEAD_QUALIFICATION_ASSISTANT',
    },
  });
});

function buildSystemPrompt() {
  return `Ты AI ассистент квалификации лидов для интегратора Битрикс24. Анализируй весь диалог после реплик клиента. Верни строго JSON: stage, discovered, missing, nextBestQuestion, objections, talkNotes, qualificationQuality, meetingProbability. Обязательные поля: ${requiredFields.map((field) => `${field.key}=${field.label}`).join(', ')}. Если клиент говорит "У нас сейчас Excel", предложи вопрос "Какую главную проблему создаёт работа в Excel?". Если клиент говорит "Нужно навести порядок в заявках", этап "Задача клиента" и следующий вопрос "Можете обозначить самую сильную боль, которая сейчас есть?". Если клиент говорит "Бюджет пока не знаем", выяви возражение "бюджет" и предложи "Чтобы понимать масштаб проекта, вы рассматриваете минимальный запуск или полноценное внедрение?".`;
}

function buildRuleBasedAnalysis(transcript) {
  const clientText = transcript
    .filter((replica) => replica.speaker === 'client')
    .map((replica) => replica.text)
    .join(' ');
  const lowerText = clientText.toLowerCase();
  const lastClientReplica = [...transcript].reverse().find((replica) => replica.speaker === 'client')?.text || '';
  const lastLower = lastClientReplica.toLowerCase();
  const discovered = discoverFields(lowerText, clientText);
  const missing = requiredFields.filter((field) => !discovered[field.key]).map((field) => field.label);
  const objections = findObjections(lowerText);
  const nextBestQuestion = pickNextQuestion(lastLower, discovered);
  const filledCount = Object.keys(discovered).length;

  return {
    stage: detectStage(lastLower, discovered),
    discovered,
    missing,
    nextBestQuestion,
    objections,
    talkNotes: buildTalkNotes(discovered, missing, objections),
    qualificationQuality: Math.min(100, Math.round((filledCount / requiredFields.length) * 100)),
    meetingProbability: estimateMeetingProbability(discovered, objections),
  };
}

function discoverFields(lowerText, originalText) {
  const discovered = {};

  if (/(ит|маркетинг|строитель|производ|услуг|ритейл|магазин|логист|медицин|образован)/i.test(originalText)) {
    discovered.businessSphere = extractSentence(originalText, /(ит|маркетинг|строитель|производ|услуг|ритейл|магазин|логист|медицин|образован)/i);
  }

  const employeesMatch = originalText.match(/(\d+)\s*(сотрудник|человек|менеджер)/i);
  if (employeesMatch) discovered.employeesCount = employeesMatch[0];

  if (lowerText.includes('навести порядок') || lowerText.includes('внедрен') || lowerText.includes('заявк')) {
    discovered.implementationGoal = extractSentence(originalText, /(навести порядок|внедрен|заявк)/i);
  }

  if (lowerText.includes('продаж')) discovered.processType = 'Продажи';
  if (lowerText.includes('внутренн')) discovered.processType = 'Внутренние процессы';
  if (lowerText.includes('производ')) discovered.productionOrProjects = 'Есть производственный контур';
  if (lowerText.includes('проект')) discovered.productionOrProjects = 'Есть проектный контур';
  if (lowerText.includes('excel') || lowerText.includes('эксель')) discovered.currentCrm = 'Excel';
  if (lowerText.includes('crm') || lowerText.includes('срм')) discovered.currentCrm = discovered.currentCrm || 'CRM используется или обсуждается';

  if (/(боль|проблем|теря|хаос|не успева|дубли|порядок)/i.test(originalText)) {
    discovered.mainPain = extractSentence(originalText, /(боль|проблем|теря|хаос|не успева|дубли|порядок)/i);
  }

  const budgetMatch = originalText.match(/(\d+[\s\d]*(тыс|млн|руб|₽)|бюджет[^.?!]*)/i);
  if (budgetMatch) discovered.budget = budgetMatch[0];

  if (/(я руководитель|я директор|принимаю решение|лпр)/i.test(originalText)) discovered.decisionMaker = 'ЛПР';
  if (/(не я принимаю|согласовать|директор решает)/i.test(originalText)) discovered.decisionMaker = 'Не ЛПР или нужен согласующий';

  const urgencyMatch = originalText.match(/(срочно|в течение месяца|за месяц|до конца квартала|на этой неделе|запуск[^.?!]*)/i);
  if (urgencyMatch) discovered.urgency = urgencyMatch[0];

  if (/(на встречу соглас|готов.*встреч|давайте.*встреч|созвон)/i.test(originalText)) discovered.meetingConsent = 'Согласен на встречу';

  return discovered;
}

function pickNextQuestion(lastLower, discovered) {
  if (lastLower.includes('excel') || lastLower.includes('эксель')) {
    return 'Какую главную проблему создаёт работа в Excel?';
  }

  if (lastLower.includes('навести порядок в заявках')) {
    return 'Можете обозначить самую сильную боль, которая сейчас есть?';
  }

  if (lastLower.includes('бюджет пока не знаем') || lastLower.includes('бюджет не знаем')) {
    return 'Чтобы понимать масштаб проекта, вы рассматриваете минимальный запуск или полноценное внедрение?';
  }

  const nextMissingField = requiredFields.find((field) => !discovered[field.key]);
  return nextMissingField ? questionsByField[nextMissingField.key] : 'Готовы зафиксировать встречу и обсудить план внедрения с оценкой сроков и бюджета?';
}

function detectStage(lastLower, discovered) {
  if (lastLower.includes('навести порядок') || discovered.implementationGoal) return 'Задача клиента';
  if (discovered.budget) return 'Бюджет и масштаб проекта';
  if (discovered.decisionMaker) return 'ЛПР и процесс принятия решения';
  if (discovered.meetingConsent) return 'Назначение встречи';
  if (discovered.currentCrm) return 'Текущий инструмент';
  return 'Выявление контекста';
}

function findObjections(lowerText) {
  const objections = [];
  if (lowerText.includes('бюджет пока не знаем') || lowerText.includes('дорого') || lowerText.includes('нет бюджета')) objections.push('бюджет');
  if (lowerText.includes('подумаем')) objections.push('нет срочности');
  if (lowerText.includes('не я принимаю')) objections.push('нет ЛПР');
  return objections;
}

function buildTalkNotes(discovered, missing, objections) {
  const notes = [];
  notes.push(`Заполнено обязательных полей: ${Object.keys(discovered).length} из ${requiredFields.length}.`);
  if (missing.length) notes.push(`Приоритетно уточнить: ${missing.slice(0, 3).join(', ')}.`);
  if (objections.length) notes.push(`Зафиксированы возражения: ${objections.join(', ')}.`);
  if (discovered.meetingConsent) notes.push('Клиент готов к следующему шагу — можно переводить в назначение встречи.');
  return notes;
}

function estimateMeetingProbability(discovered, objections) {
  let probability = 15 + Object.keys(discovered).length * 6;
  if (discovered.mainPain) probability += 12;
  if (discovered.decisionMaker === 'ЛПР') probability += 10;
  if (discovered.urgency) probability += 8;
  if (discovered.meetingConsent) probability += 20;
  probability -= objections.length * 7;
  return Math.max(5, Math.min(95, probability));
}

function extractSentence(text, pattern) {
  return text.split(/[.!?]/).find((sentence) => pattern.test(sentence))?.trim() || text.trim();
}

function normalizeAnalysis(analysis, fallbackAnalysis) {
  return {
    stage: analysis.stage || fallbackAnalysis.stage,
    discovered: analysis.discovered || fallbackAnalysis.discovered,
    missing: Array.isArray(analysis.missing) ? analysis.missing : fallbackAnalysis.missing,
    nextBestQuestion: analysis.nextBestQuestion || fallbackAnalysis.nextBestQuestion,
    objections: Array.isArray(analysis.objections) ? analysis.objections : fallbackAnalysis.objections,
    talkNotes: Array.isArray(analysis.talkNotes) ? analysis.talkNotes : fallbackAnalysis.talkNotes,
    qualificationQuality: Number.isFinite(analysis.qualificationQuality) ? analysis.qualificationQuality : fallbackAnalysis.qualificationQuality,
    meetingProbability: Number.isFinite(analysis.meetingProbability) ? analysis.meetingProbability : fallbackAnalysis.meetingProbability,
  };
}

function buildCallOutcome(analysis, clientSummary) {
  return [
    `Итог разговора: ${analysis.stage || 'квалификация лида'}.`,
    `Краткий контекст клиента: ${clientSummary || 'нет клиентских реплик'}.`,
    `Следующий шаг: ${analysis.nextBestQuestion || 'назначить встречу'}.`,
  ].join(' ');
}

app.listen(port, () => {
  console.log(`Lead qualification assistant API is running on http://localhost:${port}`);
});
