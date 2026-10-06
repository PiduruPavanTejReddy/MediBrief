import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PatientProfile } from '../types';
import { ApiService } from '../services/api';

interface AuthContextType {
  user: User | null;
  profile: PatientProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User, profile: PatientProfile | null) => void;
  logout: () => void;
  updateProfile: (profile: PatientProfile) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('medibrief_patient_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfile = async () => {
    try {
      if (!localStorage.getItem('medibrief_patient_token')) {
        setUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }
      const data = await ApiService.getProfile();
      setUser(data.user);
      setProfile(data.profile);
    } catch (err) {
      console.error('Failed to load patient session:', err);
      // If token expired, clear
      localStorage.removeItem('medibrief_patient_token');
      setToken(null);
      setUser(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, []);

  const login = (newToken: string, newUser: User, newProfile: PatientProfile | null) => {
    localStorage.setItem('medibrief_patient_token', newToken);
    setToken(newToken);
    setUser(newUser);
    setProfile(newProfile);
  };

  const logout = () => {
    localStorage.removeItem('medibrief_patient_token');
    setToken(null);
    setUser(null);
    setProfile(null);
  };

  const updateProfile = (newProfile: PatientProfile) => {
    setProfile(newProfile);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        login,
        logout,
        updateProfile,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
