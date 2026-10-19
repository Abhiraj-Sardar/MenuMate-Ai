import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChefHat, Languages, Upload, Plus, Search, Download, Sparkles, Trash2,
  Pencil, X, Check, FileText, CircleCheck, AlertCircle, LoaderCircle,
  Leaf, ArrowUpRight, Utensils, ChevronDown, Menu as MenuIcon, RefreshCw,
} from 'lucide-react'

const API = 'http://127.0.0.1:8000/api'
const LANGUAGES = ['Bengali', 'Hindi', 'English', 'Spanish', 'French', 'Japanese', 'Arabic']
const CATEGORIES = ['Starters', 'Main Course', 'Rice & Breads', 'Desserts', 'Drinks', 'Other']

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { message = (await response.json()).detail || message } catch {}
    throw new Error(message)
  }
  if (response.headers.get('content-type')?.includes('text/csv')) return response.blob()
  return response.json()
}

function money(value) {
  if (!value) return '—'
  return value.toString().startsWith('₹') ? value : `₹${value}`
}

function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [ollama, setOllama] = useState({ available: false, model: 'qwen2.5:3b' })
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('All dishes')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploadText, setUploadText] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [translateLanguage, setTranslateLanguage] = useState('Bengali')
  const [exportLanguage, setExportLanguage] = useState('original')
  const fileRef = useRef(null)

  const [form, setForm] = useState({
    name: '', description: '', category: 'Main Course', price: '', source_language: 'English',
  })

  async function refresh() {
    try {
      const data = await request('/items')
      setItems(data)
    } catch (error) {
      setNotice({ type: 'error', text: `${error.message}. Is the backend running?` })
    } finally { setLoading(false) }
  }

  async function checkOllama() {
    try { setOllama(await request('/ollama/status')) }
    catch { setOllama({ available: false, model: 'qwen2.5:3b' }) }
  }

  useEffect(() => { refresh(); checkOllama() }, [])

  const filtered = useMemo(() => items.filter(item => {
    const matchesSearch = `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(search.toLowerCase())
    const matchesTab = activeTab === 'All dishes' || item.category === activeTab
    return matchesSearch && matchesTab
  }), [items, search, activeTab])

  const total = items.length
  const translated = items.filter(i => i.translations?.length).length
  const categories = new Set(items.map(i => i.category)).size

  function notify(type, text) {
    setNotice({ type, text })
    window.setTimeout(() => setNotice(null), 5000)
  }

  function resetForm() {
    setForm({ name: '', description: '', category: 'Main Course', price: '', source_language: 'English' })
    setEditing(null)
  }

  function startEdit(item) {
    setEditing(item.id)
    setForm({
      name: item.name, description: item.description || '', category: item.category || 'Other',
      price: item.price || '', source_language: item.source_language || 'English',
    })
    setShowAdd(true)
  }

  async function saveItem(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = JSON.stringify(form)
      const saved = await request(editing ? `/items/${editing}` : '/items', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body: payload,
      })
      setItems(old => editing ? old.map(i => i.id === saved.id ? saved : i) : [saved, ...old])
      setShowAdd(false); resetForm()
      notify('success', editing ? 'Dish updated.' : 'Dish added to your menu.')
    } catch (error) { notify('error', error.message) }
    finally { setBusy(false) }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete "${item.name}" and its translations?`)) return
    try {
      await request(`/items/${item.id}`, { method: 'DELETE' })
      setItems(old => old.filter(i => i.id !== item.id))
      notify('success', 'Dish deleted.')
    } catch (error) { notify('error', error.message) }
  }

  async function translate(item) {
    setBusy(true)
    try {
      const result = await request(`/items/${item.id}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: translateLanguage }),
      })
      setItems(old => old.map(i => i.id === result.id ? result : i))
      notify('success', `${item.name} translated into ${translateLanguage}. Review it before publishing.`)
    } catch (error) { notify('error', error.message) }
    finally { setBusy(false) }
  }

  async function saveTranslation(item, translation) {
    const translated_name = window.prompt('Review translated dish name:', translation.translated_name)
    if (translated_name === null) return
    const translated_description = window.prompt('Review translated description:', translation.translated_description || '')
    if (translated_description === null) return
    try {
      await request(`/translations/${translation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translated_name, translated_description }),
      })
      await refresh()
      notify('success', 'Translation saved.')
    } catch (error) { notify('error', error.message) }
  }

  async function uploadFile(file) {
    if (!file) return
    setBusy(true); setUploadName(file.name); setUploadText('')
    try {
      const body = new FormData()
      body.append('file', file)
      const result = await request('/extract', { method: 'POST', body })
      setUploadText(result.extracted_text)
      setShowImport(true)
      notify('success', 'Text extracted locally. Review it before adding dishes.')
    } catch (error) { notify('error', error.message) }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }

  function importExtractedText() {
    // Extraction deliberately stays a draft: user reviews the text before adding a dish.
    const lines = uploadText.split('\n').map(s => s.trim()).filter(Boolean)
    const parsed = lines.map(line => {
      const match = line.match(/^(.*?)\s+(?:₹|Rs\.?|INR)\s?([\d,.]+)$/i)
      return match ? { name: match[1].replace(/[•*-]\s*/, ''), price: match[2] } : { name: line.replace(/^[•*-]\s*/, ''), price: '' }
    }).filter(row => row.name.length > 1)
    if (!parsed.length) return notify('error', 'No usable lines found. Edit the extracted text first.')
    // Add one draft item at a time via the normal API. Avoid claiming OCR lines are perfectly parsed.
    setBusy(true)
    Promise.all(parsed.slice(0, 50).map(row => request('/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...row, description: '', category: 'Other', source_language: 'English' }),
    }))).then(async () => {
      await refresh(); setShowImport(false); setUploadText('')
      notify('success', `Imported ${Math.min(parsed.length, 50)} draft line(s). Please review each dish.`)
    }).catch(error => notify('error', error.message)).finally(() => setBusy(false))
  }

  async function exportMenu() {
    try {
      const blob = await request(`/export?language=${encodeURIComponent(exportLanguage)}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `menumate-${exportLanguage}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch (error) { notify('error', error.message) }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f2] text-[#252920]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[236px] border-r border-[#e8e9e0] bg-[#fbfbf8] px-5 py-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-1">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#244b3a] text-white"><ChefHat size={22}/></div>
          <div><div className="font-bold tracking-tight">MenuMate <span className="text-[#4e8665]">AI</span></div><div className="text-[11px] text-stone-500">Local menu studio</div></div>
        </div>
        <div className="mt-10 text-[10px] font-bold uppercase tracking-[.18em] text-stone-400">Workspace</div>
        <nav className="mt-3 space-y-1">
          <button className="flex w-full items-center gap-3 rounded-xl bg-[#e9f0e8] px-3 py-2.5 text-left text-sm font-semibold text-[#244b3a]"><Utensils size={17}/> Menu editor</button>
          <button onClick={() => setShowImport(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-stone-600 hover:bg-stone-100"><Upload size={17}/> Import menu</button>
        </nav>
        <div className="mt-auto rounded-2xl border border-[#e4e7dc] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Leaf size={16} className="text-[#4e8665]"/> Private by design</div>
          <p className="mt-2 text-xs leading-5 text-stone-500">Your menu and translation requests stay on this computer. No cloud AI API is used.</p>
          <div className={`mt-3 flex items-center gap-2 text-xs ${ollama.available ? 'text-emerald-700' : 'text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${ollama.available ? 'bg-emerald-500' : 'bg-amber-500'}`}/>{ollama.available ? `Ollama connected · ${ollama.model}` : 'Ollama not connected'}</div>
        </div>
      </aside>

      <main className="lg:pl-[236px]">
        <header className="sticky top-0 z-10 border-b border-[#e8e9e0] bg-[#f7f7f2]/95 px-5 py-4 backdrop-blur md:px-9">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#244b3a] text-white lg:hidden"><ChefHat size={20}/></div>
              <div><div className="text-xs text-stone-500">Workspace / Menu editor</div><h1 className="mt-0.5 text-lg font-bold tracking-tight">Your menu studio</h1></div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowImport(true); setUploadText('') }} className="hidden items-center gap-2 rounded-xl border border-[#dfe2d7] bg-white px-3 py-2 text-sm font-semibold hover:bg-stone-50 sm:flex"><Upload size={16}/> Import</button>
              <button onClick={() => { resetForm(); setShowAdd(true) }} className="flex items-center gap-2 rounded-xl bg-[#244b3a] px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#193b2c]"><Plus size={17}/> Add dish</button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1400px] px-5 py-7 md:px-9 md:py-9">
          <section className="relative overflow-hidden rounded-[26px] bg-[#244b3a] p-6 text-white md:p-9">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-emerald-50"><Sparkles size={14}/> Your menu, understood everywhere</div>
              <h2 className="mt-5 max-w-xl text-3xl font-semibold leading-tight tracking-tight md:text-[40px]">Every dish has a story.<br/><span className="font-serif italic text-[#c8dfb9]">Let every guest read it.</span></h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50/75">Create thoughtful multilingual menus with AI that runs on your own machine.</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={() => { resetForm(); setShowAdd(true) }} className="flex items-center gap-2 rounded-xl bg-[#e1edce] px-4 py-2.5 text-sm font-bold text-[#244b3a] hover:bg-white"><Plus size={16}/> Add your first dish</button>
                <button onClick={() => setShowImport(true)} className="flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"><Upload size={16}/> Import existing menu</button>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-8 -top-12 hidden h-80 w-80 rounded-full border border-white/10 md:block"/>
            <div className="pointer-events-none absolute right-10 top-12 hidden h-56 w-56 rounded-full border border-white/10 md:block"/>
            <div className="pointer-events-none absolute right-24 top-24 hidden h-28 w-28 rounded-full bg-[#c8dfb9]/10 md:block"/>
            <div className="pointer-events-none absolute bottom-0 right-0 h-1/2 w-1/3 bg-gradient-to-t from-black/10 to-transparent"/>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total dishes" value={total} detail="In your menu" icon={<Utensils size={18}/>} />
            <Stat label="Translated dishes" value={translated} detail={total ? `${Math.round(translated / total * 100)}% of your menu` : 'Ready for translation'} icon={<Languages size={18}/>} />
            <Stat label="Categories" value={categories} detail="Menu sections" icon={<FileText size={18}/>} />
            <Stat label="AI status" value={ollama.available ? 'Ready' : 'Offline'} detail={ollama.available ? ollama.model : 'Start Ollama locally'} icon={<Sparkles size={18}/>} />
          </section>

          <section className="mt-8">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><h3 className="text-xl font-bold tracking-tight">Menu items</h3><p className="mt-1 text-sm text-stone-500">Manage dishes, translate descriptions, and prepare your menu for guests.</p></div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[190px] flex-1 md:flex-none"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dishes..." className="w-full rounded-xl border border-[#e1e3d9] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#71947c]"/></div>
                <select value={translateLanguage} onChange={e => setTranslateLanguage(e.target.value)} className="rounded-xl border border-[#e1e3d9] bg-white px-3 py-2.5 text-sm outline-none"><option value="Bengali">Bengali</option><option value="Hindi">Hindi</option><option value="English">English</option><option value="Spanish">Spanish</option><option value="French">French</option><option value="Japanese">Japanese</option><option value="Arabic">Arabic</option></select>
                <button onClick={exportMenu} className="flex items-center gap-2 rounded-xl border border-[#e1e3d9] bg-white px-3 py-2.5 text-sm font-semibold hover:bg-stone-50"><Download size={16}/> Export CSV</button>
              </div>
            </div>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {['All dishes', ...CATEGORIES].map(tab => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${activeTab === tab ? 'bg-[#244b3a] text-white' : 'border border-[#e1e3d9] bg-white text-stone-600 hover:bg-stone-50'}`}>{tab}</button>)}
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[#e4e6dc] bg-white">
              <div className="hidden grid-cols-[minmax(200px,1.7fr)_1fr_100px_1fr_150px] gap-4 border-b border-[#eceee6] bg-[#fafaf7] px-5 py-3 text-[10px] font-bold uppercase tracking-[.13em] text-stone-400 md:grid">
                <span>Dish</span><span>Category</span><span>Price</span><span>Translation</span><span className="text-right">Actions</span>
              </div>
              {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-500"><LoaderCircle className="animate-spin" size={18}/> Loading menu...</div> :
                filtered.length === 0 ? <div className="flex flex-col items-center px-6 py-14 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#edf2e9] text-[#4e8665]"><Utensils size={24}/></div><h4 className="mt-4 font-semibold">No dishes found</h4><p className="mt-1 max-w-sm text-sm text-stone-500">{items.length ? 'Try another search or category.' : 'Add a dish manually or import an existing menu to get started.'}</p><button onClick={() => { resetForm(); setShowAdd(true) }} className="mt-4 rounded-xl bg-[#244b3a] px-4 py-2 text-sm font-semibold text-white">Add a dish</button></div> :
                <div className="divide-y divide-[#eff0e9]">{filtered.map(item => {
                  const translation = item.translations?.find(t => t.language.toLowerCase() === translateLanguage.toLowerCase())
                  return <div key={item.id} className="grid gap-3 px-5 py-4 transition hover:bg-[#fcfcf9] md:grid-cols-[minmax(200px,1.7fr)_1fr_100px_1fr_150px] md:items-center md:gap-4">
                    <div className="min-w-0"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f0f1e9] text-[#61745b]"><ChefHat size={18}/></div><div className="min-w-0"><div className="truncate text-sm font-semibold">{item.name}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{item.description || 'No description yet'}</div></div></div></div>
                    <div><span className="text-[10px] font-semibold uppercase text-stone-400 md:hidden">Category · </span><span className="rounded-full bg-[#f3f3ed] px-2.5 py-1 text-xs text-stone-600">{item.category}</span></div>
                    <div className="text-sm font-semibold">{money(item.price)}</div>
                    <div>{translation ? <button onClick={() => saveTranslation(item, translation)} className="flex items-center gap-1.5 text-left text-xs font-semibold text-[#427553] hover:underline"><CircleCheck size={15}/>{translation.language} · Review</button> : <span className="text-xs text-stone-400">Not translated</span>}</div>
                    <div className="flex items-center gap-1 md:justify-end">
                      <button title={`Translate to ${translateLanguage}`} disabled={busy} onClick={() => translate(item)} className="flex items-center gap-1.5 rounded-lg bg-[#eaf1e8] px-2.5 py-2 text-xs font-bold text-[#315b40] hover:bg-[#dce9d8] disabled:opacity-50"><Languages size={14}/><span className="hidden xl:inline">Translate</span></button>
                      <button title="Edit dish" onClick={() => startEdit(item)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><Pencil size={15}/></button>
                      <button title="Delete dish" onClick={() => deleteItem(item)} className="rounded-lg p-2 text-stone-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15}/></button>
                    </div>
                  </div>
                })}</div>}
            </div>
            <div className="mt-3 flex flex-col gap-2 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between"><span>Showing {filtered.length} of {items.length} dishes</span><span className="flex items-center gap-1.5"><Leaf size={13}/> Local-first · Review translations before publishing</span></div>
          </section>

          <footer className="mt-12 border-t border-[#e5e7dd] py-5 text-xs text-stone-400"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 MenuMate AI · Built for independent restaurants</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{ollama.available ? 'Local AI connected' : 'Local AI not connected'}</span></div></footer>
        </div>
      </main>

      {notice && <div className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-xl ${notice.type === 'error' ? 'border-red-200 bg-white text-red-800' : 'border-emerald-200 bg-white text-[#28583b]'}`}><div className="mt-0.5">{notice.type === 'error' ? <AlertCircle size={18}/> : <CircleCheck size={18}/>}</div><div className="text-sm leading-5">{notice.text}</div><button onClick={() => setNotice(null)} className="ml-1 text-stone-400"><X size={15}/></button></div>}

      {showAdd && <Modal title={editing ? 'Edit dish' : 'Add a dish'} onClose={() => { setShowAdd(false); resetForm() }}>
        <form onSubmit={saveItem} className="space-y-4">
          <Field label="Dish name *"><input required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kolkata Chicken Kosha" className="field"/></Field>
          <Field label="Description"><textarea rows={3} maxLength={5000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe ingredients and preparation accurately..." className="field resize-y"/></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="field">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Price (optional)"><input value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="e.g. 280" className="field"/></Field>
          </div>
          <Field label="Source language"><select value={form.source_language} onChange={e => setForm({ ...form, source_language: e.target.value })} className="field">{LANGUAGES.map(l => <option key={l}>{l}</option>)}</select></Field>
          <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Only enter ingredients and allergen details that the restaurant has verified. The AI must not invent them.</div>
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => { setShowAdd(false); resetForm() }} className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={busy} className="rounded-xl bg-[#244b3a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : editing ? 'Save changes' : 'Add dish'}</button></div>
        </form>
      </Modal>}

      {showImport && <Modal title="Import an existing menu" onClose={() => { setShowImport(false); setUploadText(''); setUploadName('') }}>
        <div className="space-y-4">
          <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); uploadFile(e.dataTransfer.files?.[0]) }} className="cursor-pointer rounded-2xl border-2 border-dashed border-[#d6dfd2] bg-[#f8faf5] px-5 py-8 text-center transition hover:border-[#71947c] hover:bg-[#f0f5ed]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#4e8665] shadow-sm"><Upload size={22}/></div>
            <div className="mt-3 text-sm font-semibold">Drop a menu file here or browse</div><div className="mt-1 text-xs text-stone-500">PDF, JPG, PNG, WEBP or TIFF · Max 10 MB</div>
            <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff" className="hidden" onChange={e => uploadFile(e.target.files?.[0])}/>
          </div>
          {busy && <div className="flex items-center gap-2 text-sm text-stone-500"><LoaderCircle size={16} className="animate-spin"/> Processing locally...</div>}
          {uploadName && <div className="flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-sm"><FileText size={16}/><span className="truncate">{uploadName}</span></div>}
          {uploadText !== '' && <><Field label="Review and edit extracted text before importing"><textarea rows={10} value={uploadText} onChange={e => setUploadText(e.target.value)} className="field font-mono text-xs leading-5"/></Field><p className="text-xs leading-5 text-stone-500">OCR can misread text and prices. Import creates draft lines; inspect every dish and correct category, language, and price before publishing.</p><div className="flex justify-end gap-2"><button onClick={() => setUploadText('')} className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold">Clear</button><button disabled={busy} onClick={importExtractedText} className="rounded-xl bg-[#244b3a] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Importing...' : 'Import draft lines'}</button></div></>}
          <div className="border-t border-stone-100 pt-4"><p className="text-xs leading-5 text-stone-500">PDFs with selectable text and images are supported. Scanned PDFs need OCR conversion in a future enhancement. No file is sent to a cloud service.</p></div>
        </div>
      </Modal>}
    </div>
  )
}

function Stat({ label, value, detail, icon }) {
  return <div className="rounded-2xl border border-[#e4e6dc] bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm text-stone-500">{label}</span><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0f3ec] text-[#4e8665]">{icon}</span></div><div className="mt-3 text-2xl font-bold tracking-tight">{value}</div><div className="mt-1 text-xs text-stone-400">{detail}</div></div>
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#15251c]/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100"><X size={18}/></button></div>{children}</div></div>
}
function Field({ label, children }) { return <label className="block text-sm font-medium text-stone-700"><span className="mb-1.5 block">{label}</span>{children}</label> }

export default App
