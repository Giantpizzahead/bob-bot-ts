# Bob Bot

hi i am bob :D

(WIP, see `TODO.md`)

## Setup

Installation:

```sh
git clone https://github.com/Giantpizzahead/bob-bot.git
npm install
```

Environment variables (some required, some optional):

```text
DISCORD_TOKEN = Discord bot token.
DISCORD_CHANNELS = A list of channel ID strings to talk in. Ex: ['123', '456']
OPENAI_KEY = OpenAI API key.
OPENROUTER_KEY = (Unused) OpenRouter API key.
DEEPGRAM_KEY = (Unused) Deepgram API key.
SUPABASE_KEY = (Unused) Supabase vector store API key.
SUPABASE_URL = (Unused) Supabase vector store URL.
SUPABASE_PROJECT_PWD = (Unused) Supabase vector store password.
LANGCHAIN_API_KEY = (Optional) LangChain API key for LangSmith tracing.
LANGCHAIN_TRACING_V2 = (Optional) Boolean for enabling LangSmith tracing.
LANGCHAIN_CALLBACKS_BACKGROUND = true
```

Usage:

```sh
npm start
```
