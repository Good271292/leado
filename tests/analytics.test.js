import assert from 'node:assert/strict';
import { calculateTalkRatio, detectObjections, extractInsights, inferSpeaker, scoreSentiment } from '../src/analytics.js';

const transcript = [
  { speaker: 'manager', text: 'Здравствуйте, меня зовут Анна. Какая задача сейчас важна?' },
  { speaker: 'client', text: 'Нам интересно, но цена кажется дорого и нужно согласовать руководитель.' },
  { speaker: 'manager', text: 'С чем сравниваете стоимость и какой результат должен окупить решение?' }
];

assert.equal(detectObjections(transcript.map((entry) => entry.text).join(' ')).length, 2);
assert.equal(scoreSentiment('Это хорошо и интересно, но дорого').tone, 'neutral');
assert.deepEqual(calculateTalkRatio([{ speaker: 'manager', text: 'один два' }, { speaker: 'client', text: 'три' }]), {
  manager: 67,
  client: 33,
  totalWords: 3
});
assert.equal(inferSpeaker('Клиент: нам нужно согласовать бюджет'), 'client');

const insights = extractInsights(transcript);
assert.equal(insights.riskLevel, 'high');
assert.equal(insights.checklist.find((item) => item.id === 'greeting').done, true);
assert.match(insights.nextBestAction, /стоимость|сравниваете/i);

console.log('analytics tests passed');
