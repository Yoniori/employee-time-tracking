import { useState, useEffect, useContext, createContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [employeeData, setEmployeeData] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) setEmployeeData(null);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, employeeData, setEmployeeData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
