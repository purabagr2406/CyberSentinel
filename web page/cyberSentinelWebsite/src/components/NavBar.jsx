import { NavLink } from 'react-router-dom';

const NavBar = () => {
  return (
    <nav className="flex items-center justify-between bg-slate-900 p-4 text-white">
      
      {/* Left Container: Navigation Links */}
      <div className="flex gap-4">
        <NavLink 
          to="/" 
          className={({ isActive }) => isActive ? "font-bold text-emerald-400" : "text-slate-300 hover:text-white"}
        >
          Home
        </NavLink>
        
        <NavLink 
          to="/settings" 
          className={({ isActive }) => isActive ? "font-bold text-emerald-400" : "text-slate-300 hover:text-white"}
        >
          Settings
        </NavLink>
      </div>

      {/* Right Container: Download Link */}
      {/* Notice this is now an <a> tag pointing to the file in your public folder */}
      <a
        href="/cybersentinel-extension.zip"
        download="cybersentinel-extension.zip"
        className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
        title="Download Chrome Extension"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download Extension
      </a>
      
    </nav>
  );
};

export default NavBar;