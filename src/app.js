import { GOAL_CHECKLIST, extractInsights, inferSpeaker } from './analytics.js';

const demoLines = [
  { speaker: 'manager', text: 'Здравствуйте, меня зовут Анна, компания Leado. Давайте уточним цель звонка и вашу задачу.' },
  { speaker: 'client', text: 'Добрый день. Нам нужно увеличить конверсию, но бюджет ограничен и цена важна.' },
  { speaker: 'manager', text: 'Понимаю. С чем сравниваете стоимость и какой результат должен окупить решение?' },
  { speaker: 'client', text: 'Мы уже работаем с аналогом, но руководитель хочет согласовать риски.' },
  { speaker: 'manager', text: 'Хорошо, мы можем показать демо и отправлю короткое резюме выгод для руководителя.' }
];

const state = {
  transcript: [],
  demoTimer: null,
  recognition: null
};

const elements = {
  startDemo: document.querySelector('#start-demo'),
  startListening: document.querySelector('#start-listening'),
  speechSupport: document.querySelector('#speech-support'),
  nextAction: document.querySelector('#next-action'),
  objectionList: document.querySelector('#objection-list'),
  sentimentLabel: document.querySelector('#sentiment-label'),
  sentimentMeter: document.querySelector('#sentiment-meter'),
  managerRatio: document.querySelector('#manager-ratio'),
  clientRatio: document.querySelector('#client-ratio'),
  fillerCount: document.querySelector('#filler-count'),
  checklist: document.querySelector('#checklist'),
  transcript: document.querySelector('#transcript'),
  speakerSelect: document.querySelector('#speaker-select'),
  manualText: document.querySelector('#manual-text'),
  addLine: document.querySelector('#add-line'),
  clearTranscript: document.querySelector('#clear-transcript'),
  callScore: document.querySelector('#call-score'),
  riskLabel: document.querySelector('#risk-label')
};

function addTranscriptLine(speaker, text) {
  if (!text.trim()) return;

  state.transcript.push({ speaker, text: text.trim(), time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) });
  render();
}

function renderChecklist(checklist = GOAL_CHECKLIST.map((item) => ({ ...item, done: false }))) {
  elements.checklist.innerHTML = checklist
    .map((item) => `
      <li class="${item.done ? 'done' : ''}">
        <span class="dot">${item.done ? '✓' : '•'}</span>
        <span>${item.label}</span>
      </li>
    `)
    .join('');
}

function renderTranscript() {
  if (state.transcript.length === 0) {
    elements.transcript.innerHTML = '<p class="empty-state">Пока нет реплик. Запустите демо, микрофон или добавьте текст вручную.</p>';
    return;
  }

  elements.transcript.innerHTML = state.transcript
    .map((entry) => `
      <div class="transcript__line transcript__line--${entry.speaker}">
        <strong>${entry.speaker === 'client' ? 'Клиент' : 'Менеджер'} · ${entry.time}</strong>
        <span>${escapeHtml(entry.text)}</span>
      </div>
    `)
    .join('');
  elements.transcript.scrollTop = elements.transcript.scrollHeight;
}

function renderSuggestions(insights) {
  if (insights.objections.length === 0) {
    elements.objectionList.innerHTML = `
      <div class="suggestion">
        <h3>Возражений не найдено</h3>
        <p>Продолжайте задавать открытые вопросы и связывать выгоды с задачей клиента.</p>
      </div>
    `;
    return;
  }

  elements.objectionList.innerHTML = insights.objections
    .map((objection) => `
      <div class="suggestion">
        <h3>${objection.title}</h3>
        <p><strong>Сказать:</strong> ${objection.response}</p>
        <p><strong>Тактика:</strong> ${objection.playbook}</p>
      </div>
    `)
    .join('');
}

function render() {
  const insights = extractInsights(state.transcript);
  const score = calculateCallScore(insights);

  elements.nextAction.textContent = insights.nextBestAction;
  elements.sentimentLabel.textContent = insights.sentiment.label;
  elements.sentimentMeter.style.width = `${Math.max(8, Math.min(100, 50 + insights.sentiment.score * 18))}%`;
  elements.managerRatio.textContent = `${insights.talkRatio.manager}%`;
  elements.clientRatio.textContent = `${insights.talkRatio.client}%`;
  elements.fillerCount.textContent = insights.fillerCount;
  elements.callScore.textContent = score;
  elements.riskLabel.textContent = riskText(insights.riskLevel);

  renderSuggestions(insights);
  renderChecklist(insights.checklist);
  renderTranscript();
}

function calculateCallScore(insights) {
  const goalScore = insights.completedGoals * 18;
  const sentimentBonus = insights.sentiment.tone === 'positive' ? 12 : insights.sentiment.tone === 'negative' ? -14 : 4;
  const ratioPenalty = insights.talkRatio.manager > 70 ? -12 : 0;
  const objectionPenalty = insights.objections.length * 6;
  const fillerPenalty = Math.min(10, insights.fillerCount * 2);

  return Math.max(0, Math.min(100, 30 + goalScore + sentimentBonus + ratioPenalty - objectionPenalty - fillerPenalty));
}

function riskText(riskLevel) {
  return {
    low: 'Низкий риск',
    medium: 'Средний риск',
    high: 'Высокий риск'
  }[riskLevel];
}

function startDemo() {
  clearInterval(state.demoTimer);
  state.transcript = [];
  render();

  let index = 0;
  state.demoTimer = setInterval(() => {
    const line = demoLines[index];
    addTranscriptLine(line.speaker, line.text);
    index += 1;

    if (index >= demoLines.length) clearInterval(state.demoTimer);
  }, 1200);
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    elements.speechSupport.textContent = 'Ваш браузер не поддерживает Web Speech API. Используйте ручной ввод или демо.';
    elements.startListening.disabled = true;
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = 'ru-RU';
  state.recognition.continuous = true;
  state.recognition.interimResults = false;

  state.recognition.addEventListener('result', (event) => {
    const latest = event.results[event.results.length - 1][0].transcript;
    addTranscriptLine(inferSpeaker(latest), latest);
  });

  state.recognition.addEventListener('end', () => {
    elements.startListening.textContent = 'Слушать микрофон';
  });

  elements.speechSupport.textContent = 'Можно включить микрофон или протестировать сценарий через демо.';
}

function toggleListening() {
  if (!state.recognition) return;

  if (elements.startListening.textContent === 'Остановить') {
    state.recognition.stop();
    elements.startListening.textContent = 'Слушать микрофон';
    return;
  }

  state.recognition.start();
  elements.startListening.textContent = 'Остановить';
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[char]));
}

elements.startDemo.addEventListener('click', startDemo);
elements.startListening.addEventListener('click', toggleListening);
elements.addLine.addEventListener('click', () => {
  addTranscriptLine(elements.speakerSelect.value, elements.manualText.value);
  elements.manualText.value = '';
  elements.manualText.focus();
});
elements.manualText.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') elements.addLine.click();
});
elements.clearTranscript.addEventListener('click', () => {
  state.transcript = [];
  render();
});

setupSpeechRecognition();
render();
