// providers.js — Welche KI-Anbieter Feedboard ansprechen kann
//
// Bis auf Anthropic sprechen alle hier gelisteten Dienste dasselbe Protokoll
// (OpenAI-kompatibel: POST {base}/chat/completions, GET {base}/models). Es
// unterscheidet sie also im Wesentlichen die Basis-URL. Anthropic bleibt beim
// eigenen SDK, weil dort „thinking" und der Aufwand-Regler mit drinhängen.
//
// Die Liste teilen sich Server und Oberfläche, damit die Auswahl im Menü und
// das, was der Server tatsächlich aufruft, nicht auseinanderlaufen können.
//
// Läuft im Browser (als Skript) und in Node (Server und Test).
(function (global) {
  'use strict';

  const ANBIETER = [
    {
      id: 'anthropic',
      name: 'Anthropic (Claude)',
      api: 'anthropic',
      base: 'https://api.anthropic.com/v1',
      env: 'ANTHROPIC_API_KEY',
      standard: 'claude-opus-5',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      api: 'openai',
      base: 'https://api.openai.com/v1',
      env: 'OPENAI_API_KEY',
      standard: 'gpt-4o-mini',
    },
    {
      id: 'google',
      name: 'Google AI Studio',
      api: 'openai',
      base: 'https://generativelanguage.googleapis.com/v1beta/openai',
      env: 'GOOGLE_AI_API_KEY',
      standard: 'gemini-2.0-flash',
    },
    {
      id: 'groq',
      name: 'Groq',
      api: 'openai',
      base: 'https://api.groq.com/openai/v1',
      env: 'GROQ_API_KEY',
      standard: 'llama-3.3-70b-versatile',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      api: 'openai',
      base: 'https://openrouter.ai/api/v1',
      env: 'OPENROUTER_API_KEY',
      standard: 'openai/gpt-4o-mini',
    },
    {
      id: 'mistral',
      name: 'Mistral',
      api: 'openai',
      base: 'https://api.mistral.ai/v1',
      env: 'MISTRAL_API_KEY',
      standard: 'mistral-large-latest',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      api: 'openai',
      base: 'https://api.deepseek.com/v1',
      env: 'DEEPSEEK_API_KEY',
      standard: 'deepseek-chat',
    },
    // Alles andere OpenAI-kompatible: Ollama, LM Studio, vLLM im eigenen Netz.
    // Basis-URL trägt der Benutzer ein, ein Schlüssel ist dort meist unnötig.
    {
      id: 'custom',
      name: 'Eigene Basis-URL',
      api: 'openai',
      base: '',
      env: 'AI_BASE_URL',
      standard: '',
      eigeneUrl: true,
    },
  ];

  const IDS = ANBIETER.map((a) => a.id);

  function anbieter(id) {
    return ANBIETER.find((a) => a.id === id) || ANBIETER[0];
  }

  function istBekannt(id) {
    return IDS.includes(id);
  }

  // Feldname des Schlüssels in der settings-Tabelle. Pro Anbieter einer, damit
  // ein Wechsel hin und zurück nicht jedes Mal neues Eintippen verlangt.
  function schluesselFeld(id) {
    return `ai_key_${id}`;
  }

  const api = { ANBIETER, IDS, anbieter, istBekannt, schluesselFeld };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FeedboardProviders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
