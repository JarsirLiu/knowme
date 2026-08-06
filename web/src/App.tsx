import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './app/Layout'
import ChatPage from './app/ChatPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ChatPage />} />
          <Route path="chat" element={<ChatPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}