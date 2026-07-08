import React, { createContext, useContext, useState } from 'react';

type AuthContextType = {
  isLoggedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  return (
    <AuthContext.Provider value={{
      isLoggedIn,
      signIn: () => setIsLoggedIn(true),
      signOut: () => setIsLoggedIn(false),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
