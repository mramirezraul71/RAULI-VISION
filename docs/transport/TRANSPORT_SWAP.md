
# Swap de Transporte (Conceptual)

Objetivo:
- Reemplazar el StubAdapter por un Adapter real SIN tocar el core.

Contrato:
- Open()
- Send([]byte)
- Close()
- Name()

Checklist:
- El adapter aplica padding/jitter internamente.
- El core solo ve Adapter.
- Configuración vía YAML/flags.

Procedimiento:
1) Implementar Adapter en un paquete separado.
2) Inyectarlo en el Wrapper.
3) Validar con tráfico sintético.
4) Activar en ventana nocturna primero.
