# Dictado por voz de Moni (estado y límites)

**Cómo funciona:** el chat de Moni (y la carga por voz de Inicio) usan el reconocimiento de voz del navegador
(`SpeechRecognition` / `webkitSpeechRecognition`, hook `useSpeechRecognition`). El audio lo procesa el servicio del
navegador o del sistema (Google en Chrome/Android, Apple en Safari); Moni solo recibe el texto. Sin costo ni claves.

**Estados visibles en el chat:** «Escuchando…» (con «Cancelar»), «Procesando…» y avisos para permiso bloqueado, dictado
del dispositivo apagado (`service-not-allowed`), sin micrófono, sin red, sin voz y navegador sin soporte. El texto dictado se
agrega al ya escrito; el envío es manual.

**Verificado:** tests automáticos (hook, chat, mensajes) y Chrome de escritorio sin permiso de micrófono (muestra el aviso).
**Sin verificar en dispositivo físico:** Chrome de Android, Safari de iPhone y Moni instalada como PWA. En iPhone puede
fallar con `service-not-allowed` (Siri/Dictado apagados) o no existir dentro de la app instalada; el aviso lo explica.

**Alternativa si falla en iPhone/PWA/Firefox:** transcripción en el servidor (la app graba un clip corto de hasta ~30 s y una
función segura lo envía a un servicio de transcripción; las claves quedan solo en el servidor; costo orden de 0,1–1,5 ¢ por
minuto; requiere aviso de privacidad y tope por usuario/Plus). No implementada: requiere aprobación.
