export const GOAL_CHECKLIST = [
  {
    id: 'greeting',
    label: 'Поздороваться и представиться',
    patterns: ['здравствуйте', 'добрый день', 'меня зовут', 'это']
  },
  {
    id: 'need',
    label: 'Выявить задачу клиента',
    patterns: ['задача', 'цель', 'важно', 'что хотите', 'проблема', 'потребность']
  },
  {
    id: 'value',
    label: 'Связать выгоды с потребностью',
    patterns: ['поможет', 'вы получите', 'сэконом', 'увелич', 'решит']
  },
  {
    id: 'next_step',
    label: 'Зафиксировать следующий шаг',
    patterns: ['следующий шаг', 'встреч', 'демо', 'отправлю', 'созвонимся', 'договорились']
  }
];

export const OBJECTION_RULES = [
  {
    id: 'price',
    title: 'Возражение по цене',
    patterns: ['дорого', 'цена', 'стоимость', 'бюджет', 'дешевле'],
    response: 'Уточните критерии ценности: «С чем сравниваете стоимость и какой результат должен окупить решение?»',
    playbook: 'Покажите экономический эффект, разбейте цену на период, предложите пилот или пакет меньшего объёма.'
  },
  {
    id: 'timing',
    title: 'Не сейчас',
    patterns: ['позже', 'не сейчас', 'после', 'нет времени', 'вернемся'],
    response: 'Зафиксируйте причину паузы: «Что должно измениться, чтобы вернуться к вопросу?»',
    playbook: 'Согласуйте конкретную дату следующего контакта и минимальный полезный шаг до неё.'
  },
  {
    id: 'competitor',
    title: 'Сравнение с конкурентом',
    patterns: ['конкурент', 'другой поставщик', 'уже работаем', 'аналог'],
    response: 'Спросите о критериях выбора: «Что в текущем решении работает хорошо, а чего не хватает?»',
    playbook: 'Не спорьте с конкурентом; отделите обязательные требования от желательных и покажите отличие.'
  },
  {
    id: 'decision_maker',
    title: 'Нет полномочий',
    patterns: ['руководитель', 'директор', 'согласовать', 'решает не я', 'коллеги'],
    response: 'Помогите продать внутри: «Какие аргументы нужны руководителю для решения?»',
    playbook: 'Попросите совместный звонок с ЛПР или отправьте короткое резюме с выгодами и рисками бездействия.'
  }
];

const POSITIVE_WORDS = ['да', 'интересно', 'подходит', 'хорошо', 'согласен', 'полезно', 'отлично', 'нужно', 'готов'];
const NEGATIVE_WORDS = ['нет', 'не подходит', 'сомневаюсь', 'дорого', 'сложно', 'проблема', 'не сейчас', 'боюсь'];
const FILLER_WORDS = ['ну', 'как бы', 'в общем', 'типа', 'ээ', 'значит'];
const MANAGER_MARKERS = ['менеджер:', 'manager:', 'я предлагаю', 'у нас', 'мы можем', 'давайте'];
const CLIENT_MARKERS = ['клиент:', 'client:', 'нам нужно', 'мне нужно', 'у нас проблема', 'дорого'];

export function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^\p{L}\p{N}:\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(normalizedText, phrases) {
  return phrases.reduce((count, phrase) => count + (normalizedText.includes(normalizeText(phrase)) ? 1 : 0), 0);
}

export function detectObjections(text) {
  const normalizedText = normalizeText(text);

  return OBJECTION_RULES
    .filter((rule) => countMatches(normalizedText, rule.patterns) > 0)
    .map((rule) => ({
      id: rule.id,
      title: rule.title,
      response: rule.response,
      playbook: rule.playbook
    }));
}

export function scoreSentiment(text) {
  const normalizedText = normalizeText(text);
  const positive = countMatches(normalizedText, POSITIVE_WORDS);
  const negative = countMatches(normalizedText, NEGATIVE_WORDS);
  const score = positive - negative;

  if (score > 1) return { label: 'Позитивный', score, tone: 'positive' };
  if (score < 0) return { label: 'Риск / негатив', score, tone: 'negative' };
  return { label: 'Нейтральный', score, tone: 'neutral' };
}

export function checklistProgress(text) {
  const normalizedText = normalizeText(text);

  return GOAL_CHECKLIST.map((item) => ({
    ...item,
    done: countMatches(normalizedText, item.patterns) > 0
  }));
}

export function calculateTalkRatio(transcriptEntries) {
  const totals = transcriptEntries.reduce(
    (acc, entry) => {
      const words = normalizeText(entry.text).split(' ').filter(Boolean).length;
      const speaker = entry.speaker === 'client' ? 'client' : 'manager';
      acc[speaker] += words;
      return acc;
    },
    { manager: 0, client: 0 }
  );
  const totalWords = totals.manager + totals.client;

  return {
    manager: totalWords === 0 ? 0 : Math.round((totals.manager / totalWords) * 100),
    client: totalWords === 0 ? 0 : Math.round((totals.client / totalWords) * 100),
    totalWords
  };
}

export function inferSpeaker(text) {
  const normalizedText = normalizeText(text);
  const clientScore = countMatches(normalizedText, CLIENT_MARKERS);
  const managerScore = countMatches(normalizedText, MANAGER_MARKERS);

  if (clientScore > managerScore) return 'client';
  return 'manager';
}

export function extractInsights(transcriptEntries) {
  const fullText = transcriptEntries.map((entry) => entry.text).join(' ');
  const normalizedText = normalizeText(fullText);
  const objections = detectObjections(fullText);
  const sentiment = scoreSentiment(fullText);
  const checklist = checklistProgress(fullText);
  const talkRatio = calculateTalkRatio(transcriptEntries);
  const fillerCount = countMatches(normalizedText, FILLER_WORDS);
  const completedGoals = checklist.filter((item) => item.done).length;
  const riskLevel = objections.length > 1 || sentiment.tone === 'negative' ? 'high' : objections.length === 1 ? 'medium' : 'low';

  return {
    objections,
    sentiment,
    checklist,
    talkRatio,
    fillerCount,
    completedGoals,
    riskLevel,
    nextBestAction: getNextBestAction({ objections, checklist, talkRatio, sentiment })
  };
}

export function getNextBestAction({ objections, checklist, talkRatio, sentiment }) {
  const firstOpenGoal = checklist.find((item) => !item.done);

  if (objections.length > 0) return objections[0].response;
  if (talkRatio.manager > 65) return 'Задайте открытый вопрос и дайте клиенту говорить: «Расскажите, что для вас важнее всего в решении?»';
  if (sentiment.tone === 'negative') return 'Снизьте напряжение: признайте сомнение клиента и уточните первопричину.';
  if (firstOpenGoal) return `Переходите к этапу: ${firstOpenGoal.label.toLowerCase()}.`;
  return 'Подведите итог договорённостей и закрепите дату следующего шага.';
}
