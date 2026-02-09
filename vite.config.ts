import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [basicSsl(), tailwindcss(), sveltekit()],
	worker: {
		format: 'es'
	},
	ssr: {
		noExternal: ['three', '@pixiv/three-vrm']
	}
});
