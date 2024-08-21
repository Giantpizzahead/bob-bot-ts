This list will evolve as the bot progresses.

## Current Tasks

### Today

- [ ] Setup TypeScript, ESLint, and Prettier following https://typescript-eslint.io/getting-started/
- [ ] Setup testing and CI / CD with Github and Vitest following https://vitest.dev/
- [ ] Cleanup/move repository from Heroku to Github, then deploy to Heroku
- [ ] Try persistent, multi-agent paradigms in LangChain
- [ ] Try persistent, multi-agent paradigms using other tools

### Todo

- [ ] Refine prompt format so that it alternates between user and assistant with system thrown in at times (potentially, make the chat log a side thing, so the model can output more things like current mood)
- [ ] Modularize the code before it gets more complicated
- [ ] Implement simple STT
- [ ] Look into whisper/watson/alternative stt
- [ ] Look into eleven labs/alternative tts
- [ ] Look into a custom or more realistic voice for the bot
- [ ] Fix issue where Bob tries to call the same function multiple times
- [ ] Implement long-term memory by allowing Bob to auto-write to the vector database

### Future

- [ ] Find some way to improve reasoning skills
- [ ] Find some way to cut down on hallucinations when reasoning
- [ ] Don't prompt the bot every message, especially if they're sent in quick succession
- [ ] Have the bot change personalities/modes automatically when applicable (using different system messages, or different models, think through how to best do this)
- [ ] Try fine-tuning a model using Predibase

### Extra Future

- [ ] Choose an easy-to-implement game to play (Chess?)
- [ ] Choose a medium difficulty game to play (Skrriblio? osu?)
- [ ] Choose a comprehensive game to play (Minecraft, League?)
- [ ] Look into a virtual avatar for the bot, and/or how to show video in the first place

## Completed Tasks

### Basics

- [X] Initial bot setup, texting, commands, etc (didn't have a todo list in the beginning)
- [X] Encourage the bot to send many more messages than 1 or 2
- [X] Emulate work and sleep times, for realism and also to avoid distractions
- [X] Try to implement reasoning skills but realize that it's kinda not very good
- [X] Implement a period update to allow Bob to initiate its own messages
- [X] Make the bot send messages unprompted after long, random delays
- [X] Consider whether or not to migrate to Python (Answer: No, this is good.)
- [X] Implement simple TTS
- [X] Switch to openrouter api
- [X] Create a small eval suite for models
- [X] Test top roleplay rated cheap models
- [X] Switch to an uncensored model using OpenRouter
- [X] Change Bob's status when working or sleeping
- [X] Make a bare bones version of Bob (text only) for ease of testing and development

### Advanced Text

- [X] Try out Langchain with JS, see how it works
- [X] Begin looking into short and long term memory
- [X] Implement a RAG system using LangChain, embeddings, lookup queries, and a vector store
- [X] Try out LangChain tool (function) calling
- [X] Integrate an online search engine into bare bones Bob
- [X] Try other forms of conversational memory (apart from just a buffer)

### Multimodal

- [X] Allow bob to see image attachments without throwing errors for invalid images or other attachments
- [X] Feed images into an image-to-text tool, or try a multi-modal model

## Milestones and Capstones

### Text

- [X] Have Bob send a hello world message in Discord (7/13/24)
- [X] Hold a decently intelligble conversation with someone (7/13/24)
- [X] Demonstrate flexibility by playing 20 questions (7/14/24)
- [X] Demonstrate emerging reasoning skills by identifying League champs (7/15/24)
- [ ] Demonstrate improved reasoning skills by playing Jeopardy decently
- [X] Recognize and be able to vaguely discuss images (8/18/24)
- [ ] Send multiple messages at once, or send no messages when appropriate in a non-hacky way
- [ ] Initiate a DM or group chat conversation after being inactive for a while
- [ ] Remember details about people from a long time ago, say >50 messages
- [ ] Have a persistent mood and/or life story through simulated emotions and events
- [ ] Understand the difference between DMs and servers, and participate in both of them
- [ ] **Capstone:** Hold an emotional and long (requiring memory) chat conversation in DMs while acting similar to a human
- [ ] **Capstone:** Act like a normal, active Discord user in a medium sized server, replying to or initiating messages

### Voice

- [X] Join voice chat and play some music (7/15/24)
- [X] Be able to respond intelligbly to someone talking in voice chat (7/18/24)
- [ ] Respond in a more human-like voice
- [ ] Generate a response in near real-time, quick enough to not be awkward
- [ ] Integrate text chat capabilities (memory, emotions, reasoning) into voice chat
- [ ] **Capstone:** Participate decently in a group voice chat, in real-time!

### Gaming

TBD

### All Together

- [ ] **Capstone:** Have a user ask Bob to join voice chat, then ask to play a game on Discord, then have him actually join and play that video game!
