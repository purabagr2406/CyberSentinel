import { Route, Routes } from "react-router"
import Home from "./pages/Home"
import Settings from "./pages/Settings";

function App() {
  return (<>
		<Routes>
			<Route path="/home" element={<Home />} />
			<Route path="/settings" element={<Settings />} />
		</Routes>
	</>
  )
}

export default App;