import { atom } from "nanostores"
import type { Message } from "./types"
import { ChatStatus } from "./types"

export const $chatMessages = atom<Message[]>([])
export const $chatStatus = atom<ChatStatus>(ChatStatus.Ready)
export const $chatError = atom<Error | undefined>(undefined)
