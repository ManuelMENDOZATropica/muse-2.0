# Muse 2.0

**Muse 2.0** es una plataforma de colaboración creativa diseñada para transformar conversaciones de chat en un mapa de conocimiento visual y compartido en tiempo real. El sistema utiliza inteligencia artificial para actuar como un "arquitecto de información" que organiza las ideas del equipo conforme surgen.

En resumen, Muse 2.0 no es solo una interfaz para un LLM, sino una herramienta de pensamiento visual asistido por IA que ayuda a equipos a estructurar ideas abstractas en un gráfico tangible y compartido.

---

## 🚀 Componentes Clave

### 1. La Inteligencia Artificial: "Muse"
A diferencia de un chat convencional, la integración con Gemini (específicamente el modelo `gemini-2.5-flash`) tiene un rol dual en el backend:
* **Colaborador Creativo**: Responde de forma amigable y organizada (usando Markdown) para ayudar a expandir las ideas del usuario.
* **Arquitecto de Gráficos**: Analiza automáticamente la conversación reciente para identificar "conceptos principales" y "conceptos derivados", traduciéndolos en nodos y conexiones (edges) que se guardan en la base de datos.

### 2. Mapa Conceptual Visual e Interactivo
El núcleo visual del proyecto es el `NetworkMap`, desarrollado con la librería **p5.js**. Este mapa ofrece:
* **Visualización Dinámica**: Renderiza nodos y conexiones con un motor de física que incluye fuerzas de repulsión y resortes para organizar el contenido automáticamente.
* **Jerarquía de Nodos**: Diferencia visualmente entre "hubs" (conceptos centrales con muchas conexiones) y "hojas" (conceptos secundarios).
* **Expansión Manual**: Los usuarios pueden hacer clic derecho en cualquier nodo para pedirle a Muse que genere conceptos relacionados o ideas opuestas (disruptivas), expandiendo el mapa de forma dirigida.

### 3. Colaboración y Conocimiento Compartido
El sistema está diseñado para que varios usuarios trabajen sobre un mismo proyecto simultáneamente:
* **Identidad Visual**: Cada usuario puede elegir una paleta de colores personalizada (como Violeta, Azul o Verde). Los nodos creados por cada persona en el mapa conceptual reflejan su color, permitiendo identificar visualmente quién aportó cada idea.
* **Persistencia**: Todos los mensajes, nodos y conexiones se almacenan en una base de datos PostgreSQL a través de Prisma, asegurando que el conocimiento generado sea permanente y accesible para todo el equipo.

---

## 🛠 Stack Tecnológico

**Frontend:**
* [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
* [Tailwind CSS](https://tailwindcss.com/) (Estilos)
* [Lucide](https://lucide.dev/) (Iconografía)
* [p5.js](https://p5js.org/) (Renderizado del motor de física)

**Backend:**
* [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
* [Google Generative AI SDK](https://ai.google.dev/) (`@google/genai`)

**Base de Datos & ORM:**
* [PostgreSQL](https://www.postgresql.org/)
* [Prisma](https://www.prisma.io/)

**Autenticación:**
* Google OAuth (restringido a dominios específicos, ej. `@tropica.me` para entornos de equipo cerrados).

---

## ⚙️ Configuración y Despliegue Local

### Requisitos Previos
* Node.js (v18 o superior)
* Base de datos PostgreSQL
* Claves de API para Google Generative AI (Gemini) y Google OAuth credentials.

### Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/ManuelMENDOZATropica/muse-2.0.git
   cd muse-2.0
   ```

2. Configura e inicia el Backend:
   ```bash
   cd backend
   npm install
   # Configura las variables de entorno en un archivo .env
   npx prisma migrate dev
   npm run dev
   ```

3. Configura e inicia el Frontend:
   ```bash
   cd ../frontend
   npm install
   # Configura las variables de entorno para Vite (VITE_API_URL, etc.) en un archivo .env
   npm run dev
   ```
