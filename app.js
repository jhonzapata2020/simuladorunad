const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v314.0.4/full/";

let pyodide = null;
let pyodidePromise = null;
let entradasUsuario = [];
let codigoActual = "";
let ultimoSVG = "";
let esperandoEntrada = false;
let sesionActiva = false;
let lineaErrorActual = null;
let ultimoErrorTexto = "";
let totalCaracteresPegados = 0;
let totalCaracteresTipeados = 0;

const $ = id => document.getElementById(id);

const nombre = $("nombre");
const cc = $("cc");
const inputGrupo = $("input-grupo");
const codigo = $("codigo");
const lineNumbers = $("lineNumbers");
const estadoMotor = $("estadoMotor");
const consoleText = $("consoleText");
const inputArea = $("inputArea");
const btnEjecutar = $("btnEjecutar") || $("btn-ejecutar");
const btnIrLinea = $("btnIrLinea");
const btnExplicarError = $("btnExplicarError");
const explainPanel = $("explainPanel");
const insignia = $("insignia");
const badgePreview = $("badgePreview");

function escXML(v){
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&apos;");
}

function actualizarPorcentajes() {
  const badgeTipeo = $("badge-tipeo") || $("typingStats");
  const total = totalCaracteresTipeados + totalCaracteresPegados;
  const textSpan = badgeTipeo?.querySelector(".badge-text");
  
  if (total === 0 || !codigo || !codigo.value.trim()) {
    if (badgeTipeo) {
      badgeTipeo.className = "typing-badge";
      if (textSpan) textSpan.textContent = "Tipeo: 100%";
      else badgeTipeo.textContent = "✍️ Tipeo: 100%";
    }
    return;
  }
  
  const porcentajeManual = Math.max(0, Math.min(100, Math.round((totalCaracteresTipeados / total) * 100)));
  const porcentajePegado = 100 - porcentajeManual;
  
  if (badgeTipeo) {
    if (porcentajeManual >= 50) {
      badgeTipeo.className = "typing-badge";
      if (textSpan) textSpan.textContent = `Tipeo: ${porcentajeManual}%`;
      else badgeTipeo.textContent = `✍️ Tipeo: ${porcentajeManual}%`;
    } else {
      badgeTipeo.className = "typing-badge pasted-mode";
      if (textSpan) textSpan.textContent = `Pegado: ${porcentajePegado}%`;
      else badgeTipeo.textContent = `📋 Pegado: ${porcentajePegado}%`;
    }
  }
}

function calcularPorcentajes() {
  const total = totalCaracteresTipeados + totalCaracteresPegados;
  if (total === 0) return { pctManual: 100, pctPegado: 0 };
  const pctManual = Math.max(0, Math.min(100, Math.round((totalCaracteresTipeados / total) * 100)));
  const pctPegado = 100 - pctManual;
  return { pctManual, pctPegado };
}

function actualizarEstadisticasTipeo() {
  actualizarPorcentajes();
}

function actualizarMetricasAutoria() {
  actualizarPorcentajes();
}

function setEstadoMotor(texto, tipo = "idle"){
  if(!estadoMotor) return;
  const dot = estadoMotor.querySelector(".status-dot");
  const textSpan = estadoMotor.querySelector(".status-text");
  estadoMotor.className = `estado-badge estado-${tipo}`;
  if(dot && textSpan){
    textSpan.textContent = texto;
  } else {
    estadoMotor.innerHTML = `<span class="status-dot"></span><span class="status-text">${escXML(texto)}</span>`;
  }
}

/* ---------- NÚMEROS DE LÍNEA ---------- */
function actualizarNumerosLinea(){
  const cantidad = Math.max(1, codigo.value.split("\n").length);
  const lineaCursor = obtenerLineaCursor();

  let html = "";
  for(let i=1;i<=cantidad;i++){
    const clase = i === lineaErrorActual
      ? "active-line"
      : "";
    html += `<div class="${clase}" data-line="${i}">${i}</div>`;
  }
  lineNumbers.innerHTML = html;
  lineNumbers.scrollTop = codigo.scrollTop;
}

function obtenerLineaCursor(){
  return codigo.value.substring(0,codigo.selectionStart).split("\n").length;
}

function irALinea(numero){
  numero = Number(numero);
  if(!Number.isFinite(numero) || numero < 1) return;

  const texto = codigo.value;
  const lineas = texto.split("\n");
  if(numero > lineas.length) return;

  let inicio = 0;
  for(let i=0;i<numero-1;i++){
    inicio += lineas[i].length + 1;
  }

  const fin = inicio + lineas[numero-1].length;

  codigo.focus();
  codigo.setSelectionRange(inicio,fin);

  const lineHeight = parseFloat(getComputedStyle(codigo).lineHeight) || 21.7;
  codigo.scrollTop = Math.max(0,(numero-4)*lineHeight);

  lineaErrorActual = numero;
  actualizarNumerosLinea();
}

function detectarLineaError(textoError){
  const patrones = [
    /File\s+"<codigo_estudiante>",\s+line\s+(\d+)/g,
    /<codigo_estudiante>.*?line\s+(\d+)/g,
    /line\s+(\d+)/g
  ];

  for(const patron of patrones){
    let match = null;
    let ultimo = null;
    while((match = patron.exec(textoError)) !== null){
      ultimo = match;
    }
    if(ultimo){
      return parseInt(ultimo[1],10);
    }
  }
  return null;
}

function prepararNavegacionError(error){
  const linea = detectarLineaError(error);
  lineaErrorActual = linea;
  ultimoErrorTexto = error || "";

  btnExplicarError.style.display = "inline-block";

  if(linea){
    btnIrLinea.textContent = `📍 Ir a línea ${linea}`;
    btnIrLinea.style.display = "inline-block";
    actualizarNumerosLinea();

    setTimeout(()=>irALinea(linea),150);
  }else{
    btnIrLinea.style.display = "none";
    actualizarNumerosLinea();
  }
}

// Escuchar paste en todo el contenedor del editor / textarea
document.querySelector('#codigo, #editor, .editor-container, textarea')?.addEventListener('paste', (e) => {
  const textoPegado = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (textoPegado.length > 0) {
    totalCaracteresPegados += textoPegado.length;
    actualizarPorcentajes();
  }
});

// Escuchar pulsaciones de teclado individuales
document.querySelector('#codigo, #editor, .editor-container, textarea')?.addEventListener('keydown', (e) => {
  // Ignorar teclas de control / comandos
  if (!e.ctrlKey && !e.metaKey && e.key && e.key.length === 1) {
    totalCaracteresTipeados += 1;
    actualizarPorcentajes();
  }
});

codigo.addEventListener("input", (e) => {
  lineaErrorActual = null;
  btnIrLinea.style.display = "none";
  ocultarExplicacion();
  actualizarNumerosLinea();

  if (!codigo.value.trim()) {
    totalCaracteresTipeados = 0;
    totalCaracteresPegados = 0;
    actualizarPorcentajes();
  }
});

codigo.addEventListener("scroll",()=>{
  lineNumbers.scrollTop = codigo.scrollTop;
});

codigo.addEventListener("click",actualizarNumerosLinea);
codigo.addEventListener("keyup",actualizarNumerosLinea);

lineNumbers.addEventListener("click",(e)=>{
  const el = e.target.closest("[data-line]");
  if(el){
    irALinea(parseInt(el.dataset.line,10));
  }
});

btnIrLinea.addEventListener("click",()=>{
  if(lineaErrorActual) irALinea(lineaErrorActual);
});

btnExplicarError.addEventListener("click",()=>{
  mostrarExplicacionError();
});

/* ---------- CONSOLA ---------- */
function scrollConsola(){
  const consola = $("consola");
  setTimeout(()=>{ consola.scrollTop = consola.scrollHeight; },0);
}

function setConsole(texto, clase="console-info"){
  consoleText.textContent = texto;
  consoleText.className = clase;
  scrollConsola();
}

function mostrarInput(prompt){
  esperandoEntrada = true;
  promptLabel.textContent = prompt || "";
  inputArea.style.display = "flex";
  cursorMsg.textContent = "Escribe el dato y presiona Enter.";
  terminalInput.value = "";
  terminalInput.disabled = false;
  setTimeout(()=>terminalInput.focus(),50);
  scrollConsola();
}

function ocultarInput(){
  esperandoEntrada = false;
  inputArea.style.display = "none";
  promptLabel.textContent = "";
  cursorMsg.textContent = "";
}

function ocultarInsignia(){
  insignia.style.display = "none";
  badgePreview.innerHTML = "";
  ultimoSVG = "";
}

function ocultarExplicacion(){
  ultimoErrorTexto = "";
  explainPanel.style.display = "none";
  explainPanel.innerHTML = "";
  btnExplicarError.style.display = "none";
}

function escaparHTML(texto){
  return String(texto)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function obtenerTextoLinea(numero){
  if(!numero) return "";
  const lineas = codigo.value.split("\n");
  return lineas[numero - 1] || "";
}

function generarExplicacion(errorTexto) {
  if (!errorTexto) errorTexto = "";
  if (errorTexto.includes('IndexError')) {
    return 'Índice fuera de rango (IndexError): Estás intentando acceder a una posición que no existe en la lista o matriz. Recuerda que en Python las posiciones inician en 0 y terminan en longitud - 1.';
  }
  if (errorTexto.includes('ValueError')) {
    return 'Valor inválido (ValueError): La función esperaba un tipo de dato específico (por ejemplo un número en int() o float()), pero recibió un texto o formato incompatible.';
  }
  if (errorTexto.includes('KeyError')) {
    return 'Clave no encontrada (KeyError): Estás intentando acceder a una propiedad de un diccionario que no existe o está mal escrita.';
  }
  if (errorTexto.includes('IndentationError')) {
    return 'Error de indentación (IndentationError): Los bloques de código dentro de funciones, if, for o while deben tener exactamente la misma sangría (espacios al inicio).';
  }
  if (errorTexto.includes('ZeroDivisionError')) {
    return 'División por cero (ZeroDivisionError): Estás intentando dividir un número entre 0. Verifica los cálculos de promedios o totales.';
  }
  if (errorTexto.includes('UnboundLocalError')) {
    return 'Variable local no inicializada (UnboundLocalError): Intentas modificar una variable fuera de la función sin declararla como global.';
  }
  if (errorTexto.includes('AttributeError')) {
    return 'Atributo o método inválido (AttributeError): Estás aplicando un método que no pertenece a ese tipo de dato (por ejemplo usar .append() en un entero o diccionario).';
  }
  if (errorTexto.includes('NameError')) {
    return 'Nombre no definido (NameError): Usaste una variable o función que no existe o tiene errores de digitación (mayúsculas/minúsculas).';
  }
  if (errorTexto.includes('SyntaxError')) {
    return 'Error de sintaxis (SyntaxError): Falta un caracter estructural como dos puntos (:), cerrar paréntesis (), o cerrar comillas.';
  }
  if (errorTexto.includes('TypeError')) {
    return 'Error de tipos (TypeError): Intentas realizar una operación entre tipos incompatibles (por ejemplo sumar texto con números).';
  }
  return 'Revisa la estructura de tu código, los nombres de variables y la lógica de ejecución.';
}

function explicarError(errorTexto) {
  return generarExplicacion(errorTexto);
}

function construirExplicacionError(errorTexto){
  const lower = (errorTexto || "").toLowerCase();
  const linea = detectarLineaError(errorTexto);
  const lineaTexto = obtenerTextoLinea(linea);
  const explicacion = generarExplicacion(errorTexto || "");

  let tipo = "Error de ejecución";
  let causa = explicacion;
  let sugerencias = [
    "Revisa cuidadosamente la línea señalada y las líneas inmediatamente anteriores.",
    "Comprueba nombres de variables, operadores, paréntesis, comillas e indentación.",
    "Vuelve a ejecutar el programa después de corregir el error."
  ];
  let ejemplo = "";

  if(lower.includes("syntaxerror")){
    tipo = "SyntaxError";
    sugerencias = [
      "Verifica si falta un signo de dos puntos (:) en un if, for, while, def o else.",
      "Revisa paréntesis, comillas o llaves mal cerradas.",
      "Comprueba si escribiste mal una palabra clave o si dejaste una línea incompleta."
    ];
    ejemplo = "Ejemplo: if promedio >= 3:";
  } else if(lower.includes("indentationerror")){
    tipo = "IndentationError";
    sugerencias = [
      "Usa la misma cantidad de espacios en los bloques del if, for, while, def, etc.",
      "Evita mezclar tabulaciones con espacios.",
      "Alinea correctamente las líneas que pertenecen al mismo bloque."
    ];
    ejemplo = "Ejemplo:\nif promedio >= 3:\n    print(\"Aprobado\")";
  } else if(lower.includes("nameerror")){
    tipo = "NameError";
    sugerencias = [
      "Comprueba si el nombre está bien escrito.",
      "Asegúrate de haber creado la variable antes de usarla.",
      "Revisa mayúsculas y minúsculas, porque Python las diferencia."
    ];
  } else if(lower.includes("typeerror")){
    tipo = "TypeError";
    sugerencias = [
      "Revisa si estás sumando texto con números o pasando argumentos incorrectos.",
      "Convierte los datos cuando sea necesario con int(), float() o str().",
      "Comprueba que la función reciba la cantidad de argumentos esperada."
    ];
  } else if(lower.includes("valueerror")){
    tipo = "ValueError";
    sugerencias = [
      "Si usas int() o float(), verifica que el dato ingresado sea realmente numérico.",
      "Evita letras o símbolos cuando se espera un número.",
      "Valida los datos antes de convertirlos."
    ];
    ejemplo = "Ejemplo: float(\"4.5\") es válido, float(\"cuatro\") no lo es.";
  } else if(lower.includes("zerodivisionerror")){
    tipo = "ZeroDivisionError";
    sugerencias = [
      "Verifica el valor del divisor antes de hacer la operación.",
      "Agrega una condición para impedir la división entre cero.",
      "Muestra un mensaje al usuario si el divisor es 0."
    ];
  } else if(lower.includes("unboundlocalerror")){
    tipo = "UnboundLocalError";
    sugerencias = [
      "Declara la variable como global si deseas modificarla dentro de una función.",
      "Pasa la variable como parámetro o inicialízala localmente antes de usarla."
    ];
    ejemplo = "Ejemplo:\ncontador = 0\ndef incrementar():\n    global contador\n    contador += 1";
  } else if(lower.includes("indexerror")){
    tipo = "IndexError";
    sugerencias = [
      "Comprueba el tamaño de la lista con len().",
      "Recuerda que los índices empiezan en 0.",
      "No accedas a una posición mayor o igual al tamaño de la lista."
    ];
  } else if(lower.includes("keyerror")){
    tipo = "KeyError";
    sugerencias = [
      "Revisa si la clave está escrita correctamente.",
      "Usa diccionario.get(clave) si deseas evitar el error.",
      "Comprueba primero si la clave existe en el diccionario."
    ];
  } else if(lower.includes("modulenotfounderror")){
    tipo = "ModuleNotFoundError";
    sugerencias = [
      "Verifica que el nombre del módulo esté bien escrito.",
      "Comprueba si ese módulo está disponible en el entorno Pyodide.",
      "Si no es un módulo estándar, revisa si realmente puede usarse en este simulador."
    ];
  } else if(lower.includes("attributeerror")){
    tipo = "AttributeError";
    sugerencias = [
      "Comprueba el tipo de dato de la variable.",
      "Revisa si el método o atributo existe realmente para ese objeto.",
      "Asegúrate de escribir correctamente el nombre del método."
    ];
  } else if(lower.includes("eoferror")){
    tipo = "EOFError";
    sugerencias = [
      "Cuando aparezca el cuadro de entrada en la consola, escribe el valor y presiona Enter.",
      "No cierres ni reinicies la sesión mientras el programa espera datos.",
      "Verifica cuántos input() tiene el programa para ingresar todos los valores solicitados."
    ];
  }

  const sugerenciasHtml = sugerencias.map(s => `<li>${escaparHTML(s)}</li>`).join("");
  const saludoLinea = linea
    ? `¡Hola! Veo que tenemos un pequeño inconveniente en la línea ${linea}.`
    : `¡Hola! Veo que tenemos un pequeño inconveniente en la ejecución de tu código.`;

  const lineaCodigoHtml = lineaTexto
    ? `<div style="margin-top: 6px;"><code>Línea ${linea}: ${escaparHTML(lineaTexto)}</code></div>`
    : "";

  const ejemploHtml = ejemplo
    ? `<br><span class="terminal-header">📖 Ejemplo guía:</span><div>${escaparHTML(ejemplo).replaceAll("\n","<br>")}</div>`
    : "";

  return `
    <div><span class="terminal-prompt">&gt;</span> <span class="terminal-ia-character">🐍 Asistente UNAD:</span> ${saludoLinea}</div>
    <br>
    <div><span class="terminal-header">💡 Mi Consejo:</span></div>
    <div>Me parece que hay un <strong>${escaparHTML(tipo)}</strong>. ${escaparHTML(causa)}</div>
    ${lineaCodigoHtml}
    <br>
    <div><span class="terminal-header">🔧 Pasos para corregir:</span></div>
    <ul class="terminal-list">
      ${sugerenciasHtml}
    </ul>
    ${ejemploHtml}
    <br>
    <details class="terminal-technical-details">
      <summary>Ver detalles técnicos (para curiosos)</summary>
      <pre class="code-traceback">${escaparHTML(errorTexto)}</pre>
    </details>
  `;
}

function mostrarExplicacionError(){
  if(!ultimoErrorTexto) return;
  explainPanel.innerHTML = construirExplicacionError(ultimoErrorTexto);
  explainPanel.style.display = "block";
  scrollConsola();
}

async function cargarPython(){
  if(pyodide) return pyodide;
  if(pyodidePromise) return pyodidePromise;

  pyodidePromise = (async()=>{
    if(typeof loadPyodide !== "function"){
      throw new Error(
        "No se pudo cargar Pyodide. Compruebe la conexión a Internet o el acceso a jsDelivr."
      );
    }

    setEstadoMotor("⏳ Motor Python: cargando...", "loading");
    setConsole(
      "⏳ Cargando Python en el navegador...\n" +
      "La primera ejecución necesita conexión a Internet."
    );

    const p = await loadPyodide({indexURL:PYODIDE_INDEX});
    pyodide = p;
    setEstadoMotor("✅ Motor Python: listo", "ready");
    return p;
  })();

  try{
    return await pyodidePromise;
  }catch(e){
    pyodidePromise = null;
    throw e;
  }
}

function generarQRDataURL(texto){
  const contenedor = $("qrTemp");
  contenedor.innerHTML = "";

  if(typeof QRCode !== "function"){
    throw new Error("No se pudo cargar la librería para generar el código QR.");
  }

  new QRCode(contenedor,{
    text:texto,
    width:180,
    height:180,
    correctLevel:QRCode.CorrectLevel.H
  });

  const canvas = contenedor.querySelector("canvas");
  if(canvas) return canvas.toDataURL("image/png");

  const img = contenedor.querySelector("img");
  if(img && img.src) return img.src;

  throw new Error("No se pudo convertir el QR a imagen.");
}

function crearInsignia(nom, documento, grupo){
  const textGrupo = grupo ? grupo.trim() : "";
  const qrPayload = `Estudiante: ${nom} | CC: ${documento}${textGrupo ? ` | Grupo: ${textGrupo}` : ""}`;
  const qrData = generarQRDataURL(qrPayload);
  const fecha = new Date().toLocaleDateString("es-CO",{
    year:"numeric",month:"long",day:"numeric"
  });

  const { pctManual, pctPegado } = calcularPorcentajes();
  const esManual = pctManual >= 50;
  const iconoFmt = esManual ? "✍" : "📋";
  const selloTexto = esManual
    ? `${iconoFmt} Autoría: Digitación activa (${pctManual}% manual | ${pctPegado}% pegado)`
    : `${iconoFmt} Modo: Texto pegado/externo (${pctPegado}% pegado | ${pctManual}% manual)`;

  const selloColor = esManual ? "#4ade80" : "#38bdf8";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14213d"/>
      <stop offset="100%" stop-color="#274c77"/>
    </linearGradient>
  </defs>
  <rect width="1000" height="560" rx="34" fill="url(#fondo)"/>
  <rect x="24" y="24" width="952" height="512" rx="26"
        fill="none" stroke="#f4b400" stroke-width="3"/>

  <circle cx="205" cy="138" r="70" fill="#f4b400"/>
  <text x="205" y="163" text-anchor="middle"
        font-family="Arial" font-size="72" font-weight="bold" fill="#ffffff">✓</text>

  <text x="390" y="112"
        font-family="Arial" font-size="36" font-weight="bold" fill="#ffffff">INSIGNIA PYTHON</text>

  <text x="390" y="156"
        font-family="Arial" font-size="20" fill="#dce8f8">Código ejecutado correctamente</text>

  <text x="90" y="260"
        font-family="Arial" font-size="15" fill="#aebfd7">ESTUDIANTE</text>

  <text x="90" y="298"
        font-family="Arial" font-size="28" font-weight="bold" fill="#ffffff">${escXML(nom)}</text>

  <text x="90" y="338"
        font-family="Arial" font-size="20" fill="#f4b400">CC: ${escXML(documento)}</text>

  <text x="90" y="374"
        font-family="Arial" font-size="18" font-weight="bold" fill="#38bdf8">GRUPO: ${escXML(textGrupo || "N/A")}</text>

  <text x="90" y="414"
        font-family="Arial" font-size="15" fill="#dce8f8">Competencia: ejecución de código Python</text>

  <text x="90" y="442"
        font-family="Arial" font-size="14" fill="#aebfd7">${escXML(fecha)}</text>

  <!-- Sello de Autoria / Porcentaje de Digitación -->
  <rect x="90" y="464" width="600" height="40" rx="10" fill="#081b38" stroke="${selloColor}" stroke-width="2"/>
  <text x="110" y="490" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${selloColor}">${escXML(selloTexto)}</text>

  <rect x="725" y="245" width="205" height="205" rx="15" fill="#ffffff"/>
  <image href="${qrData}" x="738" y="258" width="180" height="180"/>

  <text x="827" y="482" text-anchor="middle"
        font-family="Arial" font-size="13" fill="#dce8f8">Escanea para ver datos</text>
</svg>`;
}

function mostrarInsignia(){
  try{
    const valNom = nombre ? nombre.value.trim() : "";
    const valCc = cc ? cc.value.trim() : "";
    const valGrupo = inputGrupo ? inputGrupo.value.trim() : "";
    ultimoSVG = crearInsignia(valNom, valCc, valGrupo);
    badgePreview.innerHTML = ultimoSVG;
    insignia.style.display = "block";
  }catch(e){
    insignia.style.display = "block";
    badgePreview.innerHTML =
      "<p>No fue posible crear el QR: " + escXML(e.message || String(e)) + "</p>";
  }
}

async function ejecutarSesion(esReanudacion=false){
  ocultarInsignia();
  ocultarInput();
  if(!esReanudacion) ocultarExplicacion();

  if(!esReanudacion){
    codigoActual = getEditorValue();
    entradasUsuario = [];
    lineaErrorActual = null;
    const btnIr = $("btnIrLinea");
    if(btnIr) btnIr.style.display = "none";
    actualizarNumerosLinea();
  }

  const elNom = $("nombre");
  const elCc = $("cc");
  const valNom = elNom ? elNom.value.trim() : "";
  const valCc = elCc ? elCc.value.trim() : "";

  if(!valNom){
    alert("Ingrese el nombre completo del estudiante.");
    elNom?.focus();
    return;
  }
  if(!valCc){
    alert("Ingrese la cédula o CC.");
    elCc?.focus();
    return;
  }
  if(!codigoActual.trim()){
    alert("Ingrese código Python.");
    const elCod = $("codigo") || document.querySelector("#editor, textarea");
    elCod?.focus();
    return;
  }

  const btnEj = $("btn-ejecutar") || $("btnEjecutar");
  if(btnEj) btnEj.disabled = true;
  sesionActiva = true;

  try{
    const py = await cargarPython();
    setEstadoMotor("⚙️ Motor Python: ejecutando", "running");

    try{
      await py.loadPackagesFromImports(codigoActual);
    }catch(pkgErr){
      throw new Error(
        "No fue posible cargar un paquete importado por el código.\n" +
        (pkgErr?.message || String(pkgErr))
      );
    }

    py.globals.set("__user_code__",codigoActual);
    py.globals.set("__user_inputs_json__",JSON.stringify(entradasUsuario));

    const wrapper = `
import io
import sys
import json
import builtins
import traceback

class _NeedInput(Exception):
    def __init__(self, prompt):
        self.prompt = prompt
        super().__init__(prompt)

_user_code = __user_code__
_inputs = json.loads(__user_inputs_json__)
_pos = 0

_stdout = io.StringIO()
_stderr = io.StringIO()

_old_stdout = sys.stdout
_old_stderr = sys.stderr
_old_input = builtins.input

def _interactive_input(prompt=""):
    global _pos

    if _pos >= len(_inputs):
        raise _NeedInput(str(prompt))

    value = _inputs[_pos]
    _pos += 1

    print(str(prompt), end="")
    print(value)

    return value

sys.stdout = _stdout
sys.stderr = _stderr
builtins.input = _interactive_input

_status = "ok"
_payload = ""

try:
    exec(
        compile(_user_code, "<codigo_estudiante>", "exec"),
        {"__name__": "__main__"}
    )

except _NeedInput as e:
    _status = "input"
    _payload = e.prompt

except BaseException:
    _status = "error"
    _payload = traceback.format_exc()

finally:
    sys.stdout = _old_stdout
    sys.stderr = _old_stderr
    builtins.input = _old_input

(_status, _stdout.getvalue(), _stderr.getvalue(), _payload)
`;

    const proxy = await py.runPythonAsync(wrapper);
    const r = proxy.toJs();
    if(proxy.destroy) proxy.destroy();

    const status = String(r[0]);
    const stdout = String(r[1] || "");
    const stderr = String(r[2] || "");
    const payload = String(r[3] || "");

    if(status === "input"){
      let texto = stdout;
      if(stderr.trim()) texto += "\n" + stderr;

      setConsole(texto,"console-info");
      mostrarInput(payload);
      setEstadoMotor("⌨️ Python: esperando entrada", "input");
      const btnEjInput = $("btn-ejecutar") || $("btnEjecutar");
      if(btnEjInput) btnEjInput.disabled = true;
      return;
    }

    if(status === "error"){
      let texto = "❌ EL CÓDIGO PRESENTÓ ERRORES\n\n";

      if(stdout.trim()){
        texto += "SALIDA ANTES DEL ERROR:\n" + stdout + "\n";
      }
      if(stderr.trim()){
        texto += "\nSALIDA DE ERROR:\n" + stderr + "\n";
      }

      texto += "\nDETALLE DEL ERROR:\n" + payload;

      setConsole(texto,"console-error");
      prepararNavegacionError(payload);

      setEstadoMotor("❌ Python: error", "error");
      const btnEjErr = $("btn-ejecutar") || $("btnEjecutar");
      if(btnEjErr) btnEjErr.disabled = false;
      sesionActiva = false;
      ocultarInsignia();
      return;
    }

    let texto = "✅ CÓDIGO EJECUTADO CORRECTAMENTE\n\n";

    if(stdout.trim()){
      texto += stdout;
    }else{
      texto += "El programa terminó correctamente y no produjo salida.\n";
    }

    if(stderr.trim()){
      texto += "\nMENSAJES ADICIONALES:\n" + stderr;
    }

    setConsole(texto,"console-ok");
    setEstadoMotor("✅ Motor Python: listo", "ready");
    const btnEjOk = $("btn-ejecutar") || $("btnEjecutar");
    if(btnEjOk) btnEjOk.disabled = false;
    sesionActiva = false;
    lineaErrorActual = null;
    const btnIr = $("btnIrLinea");
    const btnExp = $("btnExplicarError");
    if(btnIr) btnIr.style.display = "none";
    if(btnExp) btnExp.style.display = "none";
    actualizarNumerosLinea();
    mostrarInsignia();

  }catch(error){
    sesionActiva = false;
    const btnEjCatch = $("btn-ejecutar") || $("btnEjecutar");
    if(btnEjCatch) btnEjCatch.disabled = false;
    ocultarInput();
    ocultarInsignia();
    setEstadoMotor("❌ Motor Python: error", "error");

    setConsole(
      "❌ NO FUE POSIBLE EJECUTAR PYTHON\n\n" +
      (error?.message || String(error)),
      "console-error"
    );
  }
}

async function enviarEntrada(){
  if(!esperandoEntrada) return;
  const valor = terminalInput.value;
  terminalInput.disabled = true;
  ocultarInput();
  entradasUsuario.push(valor);
  await ejecutarSesion(true);
}

terminalInput.addEventListener("keydown",async(e)=>{
  if(e.key === "Enter"){
    e.preventDefault();
    await enviarEntrada();
  }
});

(document.getElementById('btn-ejecutar') || document.getElementById('btnEjecutar'))?.addEventListener("click", async () => {
  await ejecutarSesion(false);
});

/* ---------- DICCIONARIO DE PLANTILLAS DE CÓDIGO ---------- */
const plantillasCodigo = {
  libre: '# Escribe tu código Python aquí\nprint("¡Hola Mundo!")',
  ejemplo_input: 'nombre = input("¿Cómo te llamas? ")\nprint(f"Hola, {nombre}!")',
  prob1: `# Problema 1: Cine Full\nFILAS = 5\nASIENTOS_POR_FILA = 10\n\ndef inicializar_sala():\n    fila = [0] * ASIENTOS_POR_FILA\n    sala = [fila] * FILAS\n    return sala\n\n# Continúa el código aquí...`,
  prob2: `# Problema 2: Ventas\nVENTAS_POR_MES = {"enero": 1500, "febrero": 2200, "marzo": 1800}\nLIMITE_BONO = 5000\n\n# Continúa el código aquí...`,
  prob3: `# Problema 3: RRHH\nDATOS_EMPLEADOS = [\n    {"nombre": "Ana García", "horas": 160, "tarifa": 15.5},\n    {"nombre": "Luis Pérez", "horas": "150", "tarifa": 18.0},\n    {"nombre": "Marta López", "horas": 165, "tarifa": 12.0}\n]\n\n# Continúa el código aquí...`,
  prob4: `# Problema 4: Inventario\nINVENTARIO = [\n    {"producto": "Camisa Casual", "stock": 12, "ventas_prom": 5},\n    {"producto": "Pantalón Denim", "stock": 4, "ventas_prom": 8},\n    {"producto": "Chaqueta Lona", "stock": "8", "ventas_prom": 3}\n]\n\n# Continúa el código aquí...`,
  prob5: `# Problema 5: Proyectos\nDATOS_PROYECTO = [\n    [101, "Completado", "Ana"],\n    [102, "Pendiente", "Luis"],\n    [103, "En Curso", "Ana"],\n    [104, "Pendiente", "Marta"]\n]\n\n# Continúa el código aquí...`
};

plantillasCodigo.p1 = plantillasCodigo.prob1;
plantillasCodigo.p2 = plantillasCodigo.prob2;
plantillasCodigo.p3 = plantillasCodigo.prob3;
plantillasCodigo.p4 = plantillasCodigo.prob4;
plantillasCodigo.p5 = plantillasCodigo.prob5;

const PLANTILLAS_PROBLEMAS = plantillasCodigo;

// Función auxiliar para setear texto en el editor (soporta CodeMirror y Textarea)
function setEditorValue(texto) {
  if (window.editor && typeof window.editor.setValue === 'function') {
    window.editor.setValue(texto);
  } else {
    const el = document.querySelector('#codigo, #editor, textarea');
    if (el) el.value = texto;
  }
}

// Función auxiliar para obtener texto
function getEditorValue() {
  if (window.editor && typeof window.editor.getValue === 'function') {
    return window.editor.getValue();
  }
  const el = document.querySelector('#codigo, #editor, textarea');
  return el ? el.value : '';
}

function ejecutarPython(codigoTexto) {
  if (codigoTexto !== undefined && codigoTexto !== null) {
    setEditorValue(codigoTexto);
  }
  ejecutarSesion(false);
}

/* ---------- AUTO-GUARDADO EN LOCALSTORAGE ---------- */
const STORAGE_KEYS = {
  CODE: "pythonlab_code",
  NOMBRE: "pythonlab_nombre",
  CC: "pythonlab_cc",
  GRUPO: "pythonlab_grupo",
  PROBLEMA: "pythonlab_problema"
};

function guardarEnLocalStorage() {
  try {
    const val = getEditorValue();
    localStorage.setItem(STORAGE_KEYS.CODE, val);
    localStorage.setItem("unad_python_code", val);
    const elNom = document.getElementById("nombre");
    const elCc = document.getElementById("cc");
    const elGrupo = document.getElementById("input-grupo");
    if (elNom) localStorage.setItem(STORAGE_KEYS.NOMBRE, elNom.value);
    if (elCc) localStorage.setItem(STORAGE_KEYS.CC, elCc.value);
    if (elGrupo) localStorage.setItem(STORAGE_KEYS.GRUPO, elGrupo.value);
    const selectProb = document.getElementById("select-problema");
    if (selectProb) localStorage.setItem(STORAGE_KEYS.PROBLEMA, selectProb.value);
  } catch (e) {
    console.warn("No se pudo guardar en localStorage:", e);
  }
}

function restaurarDesdeLocalStorage() {
  try {
    const elNom = document.getElementById("nombre");
    const elCc = document.getElementById("cc");
    const elGrupo = document.getElementById("input-grupo");

    const savedNombre = localStorage.getItem(STORAGE_KEYS.NOMBRE);
    const savedCc = localStorage.getItem(STORAGE_KEYS.CC);
    const savedGrupo = localStorage.getItem(STORAGE_KEYS.GRUPO);
    const savedProb = localStorage.getItem(STORAGE_KEYS.PROBLEMA);
    const savedCode = localStorage.getItem(STORAGE_KEYS.CODE) || localStorage.getItem("unad_python_code");

    if (savedNombre && elNom) elNom.value = savedNombre;
    if (savedCc && elCc) elCc.value = savedCc;
    if (savedGrupo && elGrupo) elGrupo.value = savedGrupo;

    const selectProb = document.getElementById("select-problema");
    if (savedProb && selectProb) {
      selectProb.value = savedProb;
    }

    if (savedCode !== null && savedCode !== undefined && savedCode.trim().length > 0) {
      setEditorValue(savedCode);
    }
  } catch (e) {
    console.warn("No se pudo restaurar de localStorage:", e);
  }
}

function reconectarEventosBarraEditor() {
  // Evento del Selector
  const selectProb = document.getElementById('select-problema');
  if (selectProb) {
    selectProb.onchange = (e) => {
      const key = e.target.value;
      if (plantillasCodigo[key] !== undefined) {
        setEditorValue(plantillasCodigo[key]);
        lineaErrorActual = null;
        totalCaracteresTipeados = getEditorValue().length;
        totalCaracteresPegados = 0;
        actualizarNumerosLinea();
        actualizarPorcentajes();
        guardarEnLocalStorage();
      }
    };
  }

  // Evento Limpiar
  const btnLimpiar = document.getElementById('btn-limpiar') || document.getElementById('btnLimpiar');
  if (btnLimpiar) {
    btnLimpiar.onclick = () => {
      setEditorValue('');
      entradasUsuario = [];
      codigoActual = "";
      lineaErrorActual = null;
      totalCaracteresTipeados = 0;
      totalCaracteresPegados = 0;

      ocultarInput();
      ocultarInsignia();
      ocultarExplicacion();

      const btnIr = document.getElementById('btnIrLinea');
      const btnExp = document.getElementById('btnExplicarError');
      const btnEj = document.getElementById('btn-ejecutar') || document.getElementById('btnEjecutar');

      if (btnIr) btnIr.style.display = "none";
      if (btnExp) btnExp.style.display = "none";
      if (btnEj) btnEj.disabled = false;

      const sel = document.getElementById('select-problema');
      if (sel) sel.value = 'libre';

      try {
        localStorage.removeItem("pythonlab_code");
        localStorage.removeItem("unad_python_code");
        localStorage.setItem("pythonlab_problema", "libre");
      } catch (e) {
        console.warn("No se pudo limpiar localStorage:", e);
      }

      setConsole("Editor limpio. Escribe un programa y presiona ▶ Ejecutar.", "console-info");
      actualizarNumerosLinea();
      actualizarPorcentajes();

      setTimeout(() => {
        const el = document.querySelector('#codigo, #editor, textarea');
        el?.focus();
      }, 50);
    };
  }

  // Evento Ejecutar
  const btnEjecutar = document.getElementById('btn-ejecutar') || document.getElementById('btnEjecutar');
  if (btnEjecutar) {
    btnEjecutar.onclick = () => {
      const codigoText = getEditorValue();
      if (typeof ejecutarPython === 'function') {
        ejecutarPython(codigoText);
      } else {
        ejecutarSesion(false);
      }
    };
  }

  // Evento Reiniciar consola
  const btnReiniciar = document.getElementById('btnReiniciar');
  if (btnReiniciar) {
    btnReiniciar.onclick = () => {
      entradasUsuario = [];
      codigoActual = "";
      sesionActiva = false;
      lineaErrorActual = null;
      ocultarInput();
      ocultarInsignia();
      const btnIr = document.getElementById('btnIrLinea');
      const btnExp = document.getElementById('btnExplicarError');
      const btnEj = document.getElementById('btn-ejecutar') || document.getElementById('btnEjecutar');
      if (btnIr) btnIr.style.display = "none";
      if (btnExp) btnExp.style.display = "none";
      if (btnEj) btnEj.disabled = false;
      if (pyodide) {
        setEstadoMotor("✅ Motor Python: listo", "ready");
      } else {
        setEstadoMotor("⏳ Motor Python: sin iniciar", "idle");
      }
      setConsole("Sesión reiniciada. Presiona ▶ Ejecutar para comenzar.", "console-info");
      actualizarNumerosLinea();
    };
  }

  // Evento Descargar Insignia
  const btnDescargar = document.getElementById('btnDescargar');
  if (btnDescargar) {
    btnDescargar.onclick = () => {
      if (!ultimoSVG) return;
      const blob = new Blob([ultimoSVG], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const elCc = document.getElementById("cc");
      const docSeguro = elCc ? elCc.value.trim().replace(/[^0-9A-Za-z_-]/g, "_") : "estudiante";
      a.href = url;
      a.download = `insignia_python_${docSeguro || "estudiante"}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
}

// Reconexión al cargar DOM
document.addEventListener("DOMContentLoaded", () => {
  reconectarEventosBarraEditor();
  restaurarDesdeLocalStorage();

  ["nombre", "cc", "input-grupo"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", guardarEnLocalStorage);
  });

  const txtArea = document.querySelector('#codigo, #editor, textarea');
  if (txtArea) {
    txtArea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = txtArea.selectionStart;
        const end = txtArea.selectionEnd;
        txtArea.value = txtArea.value.substring(0, start) + "    " + txtArea.value.substring(end);
        txtArea.selectionStart = txtArea.selectionEnd = start + 4;
        actualizarNumerosLinea();
        guardarEnLocalStorage();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const btnEj = document.getElementById('btn-ejecutar') || document.getElementById('btnEjecutar');
        if (!btnEj || !btnEj.disabled) {
          ejecutarPython(getEditorValue());
        }
      }
    });

    txtArea.addEventListener("input", () => {
      guardarEnLocalStorage();
    });
  }
});

window.addEventListener("load", () => {
  reconectarEventosBarraEditor();
  restaurarDesdeLocalStorage();
  actualizarNumerosLinea();
  const val = getEditorValue();
  if (val && val.length > 0) {
    totalCaracteresTipeados = val.length;
    actualizarPorcentajes();
  }

  setTimeout(() => {
    if (typeof loadPyodide !== "function") {
      setEstadoMotor("⚠️ Pyodide no disponible", "error");
      setConsole(
        "⚠️ Chrome abrió la aplicación, pero no pudo descargar Pyodide.\n\n" +
        "Compruebe la conexión a Internet o posibles bloqueos de red.",
        "console-error"
      );
    }
  }, 1200);
});
