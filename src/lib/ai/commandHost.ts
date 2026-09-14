import { createContext, useContext } from 'react'
import type { CommandHost } from './commands'

export type { CommandHost }

export const CommandHostContext = createContext<CommandHost | null>(null)

export const useCommandHost = () => useContext(CommandHostContext)
