# Guía de Contribución — Asistente EIT UDP 🎓✨

¡Gracias por tu interés en colaborar con el **Asistente EIT UDP**! Este es un proyecto Open Source creado por y para la comunidad estudiantil de la Escuela de Informática y Telecomunicaciones de la Universidad Diego Portales.

---

## 🚀 ¿Cómo puedes contribuir?

1. **Reportando errores:** Si encuentras información desactualizada, errores en las respuestas o problemas de interfaz, abre un [Issue](https://github.com/victorbarrera1/asistente-eit/issues).
2. **Proponiendo nuevas funcionalidades:** ¿Tienes ideas para integrar nuevas fuentes de datos, calculadoras de ramos o accesos rápidos? ¡Nos encantaría escucharlas!
3. **Mejorando la documentación y reglamentos:** Ayudando a mantener las fuentes de información al día.
4. **Enviando código (Pull Requests):** Ya sea corrigiendo un bug o implementando una mejora.

---

## 🛠️ Flujo de Desarrollo Local

### 1. Clonar el repositorio y configurar dependencias
```bash
git clone https://github.com/victorbarrera1/asistente-eit.git
cd asistente-eit
npm install
```

### 2. Configurar variables de entorno
Copia la plantilla `.env.example` a `.env`:
```bash
cp .env.example .env
```
Completa las credenciales de Supabase y asegúrate de tener Ollama corriendo localmente (`ollama run llama3.1:8b`).

### 3. Iniciar el entorno de desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📋 Reglas para Pull Requests (PR)

1. Crea una rama descriptiva para tu cambio:
   ```bash
   git checkout -b feature/nueva-funcionalidad
   # o
   git checkout -b fix/correccion-bug
   ```
2. Asegúrate de que el proyecto compile limpiamente:
   ```bash
   npm run build
   ```
3. Haz commits claros y atómicos siguiendo el estándar de [Conventional Commits](https://www.conventionalcommits.org/).
4. Envía tu Pull Request describiendo los cambios y capturas de pantalla si modificas la interfaz.

---

## 📜 Código de Conducta

Este proyecto se rige por nuestro [Código de Conducta](CODE_OF_CONDUCT.md). Al participar, te comprometes a fomentar un ambiente colaborativo, respetuoso y abierto para todos.
