import { create } from 'zustand'
import { persist } from 'zustand/middleware'

let idCounter = 0
const newId = () => `req-${++idCounter}-${Date.now()}`

const blankRequest = (overrides = {}) => ({
  id: newId(),
  title: 'New Request',
  method: 'GET',
  url: '',
  headers: [],
  body: '',
  urlParams: {},
  response: null,
  isLoading: false,
  error: null,
  ...overrides,
})

const useAppStore = create(
  persist(
    (set, get) => ({
      openRequests: [blankRequest()],
      activeRequestId: null,
      savedRequests: [],
      openApiTemplates: [],

      // Initialise activeRequestId after hydration
      _init() {
        const { openRequests, activeRequestId } = get()
        if (!activeRequestId && openRequests.length > 0) {
          set({ activeRequestId: openRequests[0].id })
        }
      },

      addRequest(template = {}) {
        const req = blankRequest(template)
        set(state => ({
          openRequests: [...state.openRequests, req],
          activeRequestId: req.id,
        }))
        return req.id
      },

      removeRequest(id) {
        set(state => {
          const filtered = state.openRequests.filter(r => r.id !== id)
          const next = filtered.length === 0 ? [blankRequest()] : filtered
          const activeId =
            state.activeRequestId === id
              ? next[Math.max(0, state.openRequests.findIndex(r => r.id === id) - 1)]?.id ?? next[0].id
              : state.activeRequestId
          return { openRequests: next, activeRequestId: activeId }
        })
      },

      updateRequest(id, patch) {
        set(state => ({
          openRequests: state.openRequests.map(r =>
            r.id === id ? { ...r, ...patch } : r
          ),
        }))
      },

      setActiveRequest(id) {
        set({ activeRequestId: id })
      },

      saveRequest(id) {
        const req = get().openRequests.find(r => r.id === id)
        if (!req) return
        const saved = {
          ...req,
          id: newId(),
          savedAt: Date.now(),
          name: `${req.method} ${req.url || 'Untitled'}`,
        }
        set(state => ({ savedRequests: [...state.savedRequests, saved] }))
      },

      loadRequest(saved) {
        const { addRequest } = get()
        addRequest({
          method: saved.method,
          url: saved.url,
          headers: saved.headers,
          body: saved.body,
          title: saved.name,
        })
      },

      deleteFromLibrary(id) {
        set(state => ({
          savedRequests: state.savedRequests.filter(r => r.id !== id),
        }))
      },

      setOpenApiTemplates(templates) {
        set({ openApiTemplates: templates })
      },
    }),
    {
      name: 'http-client-store',
      partialize: state => ({ savedRequests: state.savedRequests }),
    }
  )
)

export default useAppStore
