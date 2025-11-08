import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import store from '../app/store.js'

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
	<StrictMode>
		<Provider store={store}>
			<MemoryRouter>
				<App />
			</MemoryRouter>
		</Provider>
	</StrictMode>,
)
