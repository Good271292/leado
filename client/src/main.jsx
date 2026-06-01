import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const requiredFields = [
  { key: 'businessSphere', label: 'Сфера бизнеса' },
  { key: 'employeesCount', label: 'Количество сотрудников' },
  { key: 'implementationGoal', label: 'Основная задача внедрения' },
  { key: 'processType', label: 'Продажи или внутренние процессы' },
  { key: 'productionOrProjects', label: 'Производство/проекты' },
  { key: 'currentCrm', label: 'Наличие текущей CRM' },
  { key: 'mainPain', label: 'Основная боль клиента' },
  { key: 'budget', label: 'Бюджет' },
  { key: 'decisionMaker', label: 'ЛПР или нет' },
  { key: 'urgency', label: 'Срочность запуска' },
  { key: 'meetingConsent', label: 'Согласие на встречу' },
];

const initialAnalysis = {
  stage: 'Начало квалификации',
  discovered: {},
  missing: requiredFields.map((field) => field.label),
  nextBestQuestion: 'Расскажите, пожалуйста, в какой сфере работает ваша компания?',
  objections: [],
  talkNotes: ['Ожидаем первую содержательную реплику клиента.'],
  qualificationQuality: 0,
  meetingProbability: 15,
};

const demoPhrases = [
  'У нас сейчас Excel, CRM пока нет.',
  'Нужно навести порядок в заявках, менеджеры теряют обращения.',
  'В компании 45 сотрудников, внедрение нужно для отдела продаж.',
  'Бюджет пока не знаем, хотим понять порядок цифр.',
  'Я руководитель продаж, запуск нужен в течение месяца, на встречу согласен.',
];

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function App() {
  const [transcript, setTranscript] = useState([
    { id: crypto.randomUUID(), speaker: 'manager', text: 'Добрый день! Расскажите, что хотите улучшить в Битрикс24?' },
  ]);
  const [speaker, setSpeaker] = useState('client');
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [bitrixResult, setBitrixResult] = useState(null);

  const completionPercent = useMemo(() => {
    const filled = requiredFields.filter((field) => analysis.discovered?.[field.key]).length;
    return Math.round((filled / requiredFields.length) * 100);
  }, [analysis.discovered]);

  async function analyzeConversation(nextTranscript) {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: nextTranscript }),
      });
      const data = await response.json();
      setAnalysis(data.analysis);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function addReplica(overrideText) {
    const replicaText = (overrideText || text).trim();
    if (!replicaText) return;

    const nextTranscript = [...transcript, { id: crypto.randomUUID(), speaker, text: replicaText }];
    setTranscript(nextTranscript);
    setText('');
    setBitrixResult(null);

    if (speaker === 'client') {
      await analyzeConversation(nextTranscript);
    }
  }

  async function finalizeCall() {
    const response = await fetch(`${apiUrl}/api/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, analysis }),
    });
    const data = await response.json();
    setBitrixResult(data.bitrix24Payload);
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Битрикс24 интегратор · real-time qualification</p>
          <h1>AI Ассистент квалификации лидов</h1>
          <p className="hero__copy">
            Анализирует разговор, ведёт менеджера по обязательным вопросам и готовит данные для автозаполнения сделки.
          </p>
        </div>
        <div className="score-card">
          <span>Вероятность встречи</span>
          <strong>{analysis.meetingProbability}%</strong>
          <small>Качество квалификации: {analysis.qualificationQuality}%</small>
        </div>
      </header>

      <section className="workspace">
        <section className="panel transcript-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Левая колонка</p>
              <h2>Транскрипт разговора</h2>
            </div>
            {isAnalyzing && <span className="live-dot">GPT анализирует</span>}
          </div>

          <div className="transcript-list">
            {transcript.map((replica) => (
              <article key={replica.id} className={`replica replica--${replica.speaker}`}>
                <span>{replica.speaker === 'manager' ? 'Менеджер' : 'Клиент'}</span>
                <p>{replica.text}</p>
              </article>
            ))}
          </div>

          <div className="composer">
            <div className="speaker-toggle" aria-label="Выбор роли реплики">
              <button className={speaker === 'client' ? 'active' : ''} onClick={() => setSpeaker('client')}>Клиент</button>
              <button className={speaker === 'manager' ? 'active' : ''} onClick={() => setSpeaker('manager')}>Менеджер</button>
            </div>
            <textarea
              value={text}
              placeholder="Добавьте следующую реплику..."
              onChange={(event) => setText(event.target.value)}
            />
            <button className="primary" onClick={() => addReplica()}>Добавить реплику</button>
            <div className="demo-row">
              {demoPhrases.map((phrase) => (
                <button key={phrase} onClick={() => addReplica(phrase)}>{phrase}</button>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel insight-panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Правая колонка</p>
              <h2>Рекомендации GPT</h2>
            </div>
            <span className="progress-pill">{completionPercent}% полей</span>
          </div>

          <div className="stage-card">
            <span>Текущий этап скрипта</span>
            <strong>{analysis.stage}</strong>
          </div>

          <section className="recommendation">
            <h3>Следующий лучший вопрос</h3>
            <p>{analysis.nextBestQuestion}</p>
          </section>

          <div className="grid-two">
            <section>
              <h3>Что уже выяснено</h3>
              <ul className="check-list">
                {requiredFields.filter((field) => analysis.discovered?.[field.key]).map((field) => (
                  <li key={field.key}><span>✓</span>{field.label}: {analysis.discovered[field.key]}</li>
                ))}
                {!requiredFields.some((field) => analysis.discovered?.[field.key]) && <li className="muted">Пока нет заполненных обязательных полей.</li>}
              </ul>
            </section>
            <section>
              <h3>Что нужно выяснить</h3>
              <ul className="missing-list">
                {analysis.missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          </div>

          <section>
            <h3>Замечания по разговору</h3>
            <ul className="notes-list">
              {analysis.talkNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>

          <section>
            <h3>Возражения</h3>
            <div className="objections">
              {analysis.objections.length ? analysis.objections.map((objection) => <span key={objection}>{objection}</span>) : <span className="muted">Возражений не выявлено</span>}
            </div>
          </section>

          <button className="primary wide" onClick={finalizeCall}>Завершить разговор и заполнить сделку</button>
          {bitrixResult && (
            <section className="bitrix-card">
              <h3>Payload для сделки Битрикс24</h3>
              <pre>{JSON.stringify(bitrixResult, null, 2)}</pre>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
