import React from 'react'
import { Route, Routes, Outlet, Link } from 'react-router-dom'
import Home from './pages/Home'
import Settings from './pages/Settings'
import NavBar from './components/NavBar'
import Footer from './components/Footer'

const App = () => {
	return (
		<Routes>
			<Route path='/' element={<MainLayout />}>
				<Route index element={<Home />} />
				<Route path='settings' element={<Settings />} />
			</Route>
		</Routes>
	)
}

const MainLayout = () => {
	return (
		<div className="app-container">
			{/* This Header stays on screen always */}
			<header>
				<NavBar />
			</header>

			{/* The child route's content is injected here */}
			<main style={{ padding: "20px" }}>
				<Outlet />
			</main>

			{/* This Footer stays on screen always */}
			<footer>
				<Footer />
			</footer>
		</div>
	);
};

export default App
