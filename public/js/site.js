// Runs on every page: draws the decorative icons and adds the chat assistant.
import { createApi } from './api.js';
import { createChatbot } from './chatbot.js';
import { sessionStorageOrNull } from './chatStore.js';
import { hydrateIcons } from './icons.js';
import { browserStorage, createStore } from './store.js';

hydrateIcons(document);

const planStore = createStore(browserStorage());
const chat = createChatbot({
  api: createApi(),
  storage: sessionStorageOrNull(),
  // The saved plan, when there is one, lets the assistant answer about it.
  getContext: () => {
    const saved = planStore.load();
    return saved ? { event: saved.plan.input } : null;
  },
});
document.body.append(chat.element);
