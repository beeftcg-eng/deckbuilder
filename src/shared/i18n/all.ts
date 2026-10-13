import { registerMessages } from './index'
import { es } from './es'
import { pt } from './pt'

/** Every language at once, for code that can't wait for one to load (the desktop app's main process, tests). */
registerMessages('es', es)
registerMessages('pt', pt)
