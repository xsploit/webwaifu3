<script lang="ts">
	import { getCharacterState, toast } from '../../stores/app.svelte.js';
	import { getStorageManager } from '../../storage/index.js';

	const chars = getCharacterState();
	const storage = getStorageManager();

	let name = $state('');
	let systemPrompt = $state('');
	let description = $state('');
	let importInput: HTMLInputElement;

	$effect(() => {
		if (storage.db) loadCharacters();
	});

	async function loadCharacters() {
		if (!storage.db) return;
		const all = await storage.getAllCharacters();
		chars.all = all;
		if (all.length > 0 && !chars.current) {
			selectCharacter(all[0]);
		}
	}

	function selectCharacter(c: typeof chars.current) {
		if (!c) return;
		chars.current = c;
		name = c.name;
		systemPrompt = c.systemPrompt;
		description = c.description ?? '';
		if (c.id && storage.db) storage.setActiveCharacter(c.id);
	}

	async function saveCharacter() {
		if (!storage.db || !name.trim()) return toast('Enter a character name');
		const data = { name: name.trim(), systemPrompt, description };
		if (chars.current?.id) {
			await storage.saveCharacter({ ...data, id: chars.current.id });
			toast('Character updated');
		} else {
			await storage.saveCharacter(data);
			toast('Character created');
		}
		await loadCharacters();
	}

	function newCharacter() {
		chars.current = null;
		name = '';
		systemPrompt = '';
		description = '';
	}

	async function deleteCharacter() {
		if (!storage.db || !chars.current?.id) return;
		await storage.deleteCharacter(chars.current.id);
		toast('Character deleted');
		newCharacter();
		await loadCharacters();
	}

	function exportCharacter() {
		if (!chars.current) return toast('No character selected');
		const json = JSON.stringify({ name, systemPrompt, description }, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${name || 'character'}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function handleImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(reader.result as string);
				name = data.name || '';
				systemPrompt = data.systemPrompt || '';
				description = data.description || '';
				chars.current = null;
				toast('Character imported - click Save');
			} catch {
				toast('Invalid character file');
			}
		};
		reader.readAsText(file);
	}
</script>

<div class="control-group">
	<div class="control-label">Active Character</div>
	<select class="select-tech" onchange={(e) => {
		const idx = (e.target as HTMLSelectElement).selectedIndex;
		if (chars.all[idx]) selectCharacter(chars.all[idx]);
	}}>
		{#each chars.all as c}
			<option selected={chars.current?.id === c.id}>{c.name}</option>
		{/each}
		{#if chars.all.length === 0}
			<option>No characters</option>
		{/if}
	</select>
</div>

<div class="control-group">
	<div class="control-label">Character Name</div>
	<input type="text" class="input-tech" bind:value={name} placeholder="Character name..." />
</div>

<div class="control-group">
	<div class="control-label">System Prompt</div>
	<textarea class="textarea-tech" rows="6" bind:value={systemPrompt} placeholder="Define your character's personality..."></textarea>
</div>

<div class="control-group">
	<div class="control-label">Description (optional)</div>
	<input type="text" class="input-tech" bind:value={description} placeholder="Brief description..." />
</div>

<div class="btn-row">
	<button class="btn-tech" onclick={saveCharacter}>Save Character</button>
	<button class="btn-tech secondary" onclick={newCharacter}>New</button>
</div>

<div class="btn-row" style="margin-top:12px;">
	<button class="btn-tech danger" onclick={deleteCharacter}>Delete</button>
	<button class="btn-tech secondary" onclick={exportCharacter}>Export</button>
	<button class="btn-tech secondary" onclick={() => importInput.click()}>Import</button>
	<input bind:this={importInput} type="file" accept=".json" style="display:none" onchange={handleImportFile} />
</div>

<style>
	.control-group { display: flex; flex-direction: column; gap: 8px; }
	.control-label { font-size: 0.7rem; color: var(--c-text-accent); font-family: var(--font-tech); text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
	.input-tech, .textarea-tech, .select-tech {
		width: 100%;
		background: rgba(0,0,0,0.4);
		border: 1px solid var(--c-border);
		color: var(--text-main);
		padding: 10px;
		font-size: 0.85rem;
		font-family: var(--font-ui);
		transition: border-color 0.2s;
	}
	.input-tech:focus, .textarea-tech:focus, .select-tech:focus {
		outline: none;
		border-color: var(--c-text-accent);
	}
	.textarea-tech { resize: vertical; }
	.select-tech { cursor: pointer; }
	.select-tech option { background: #0d1117; }
	.btn-row { display: flex; gap: 8px; }
	.btn-tech { flex: 1; padding: 10px; background: transparent; border: 1px solid var(--c-text-accent); color: var(--c-text-accent); font-family: var(--font-tech); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; }
	.btn-tech:hover { background: var(--c-text-accent); color: #000; }
	.btn-tech.secondary { border-color: var(--c-border); color: var(--text-muted); }
	.btn-tech.secondary:hover { border-color: var(--text-main); color: var(--text-main); background: transparent; }
	.btn-tech.danger { border-color: var(--danger); color: var(--danger); }
	.btn-tech.danger:hover { background: var(--danger); color: #000; }
</style>
