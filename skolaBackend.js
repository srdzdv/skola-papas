const FacturapiClient = require('facturapi');

// Fetch All invoices issued to a certain customer
Parse.Cloud.define("fetchCustomerListaFacturas", async (request) => {
  const { estudianteId, escuelaId } = request.params;

  // Validate required parameters
  if (!estudianteId || !escuelaId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, "estudianteId and escuelaId are required");
  }

  // Fetch the escuela
  const Escuela = Parse.Object.extend("Escuela");
  const queryEscuela = new Parse.Query(Escuela);
  const escuelaObj = await queryEscuela.get(escuelaId);

  if (!escuelaObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Escuela not found");
  }

  // Fetch the escuela subscription
  const Subscripcion = Parse.Object.extend("Subscripcion");
  const querySubscripcion = new Parse.Query(Subscripcion);
  querySubscripcion.equalTo("escuela", escuelaObj);
  const subscripcionObj = await querySubscripcion.first();

  if (!subscripcionObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Subscripcion not found for escuela");
  }

  const facturapiOrgKey = subscripcionObj.get("facturapiOrgKey");

  if (!facturapiOrgKey) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Escuela has no facturapi org key");
  }

  // Fetch Facturapi object for estudiante
  const FacturapiRecord = Parse.Object.extend("Facturapi");
  const queryFacturapi = new Parse.Query(FacturapiRecord);
  queryFacturapi.equalTo("estudiante", estudianteId);
  const facturapiObj = await queryFacturapi.first();

  if (!facturapiObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Facturapi record not found for estudiante");
  }

  const facturapiCustomerId = facturapiObj.get("facturapiCustomerId");

  if (!facturapiCustomerId) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Estudiante has no facturapiCustomerId");
  }

  // Fetch invoice list from Facturapi
  const facturapi = new FacturapiClient(facturapiOrgKey);
  const invoiceSearch = await facturapi.invoices.list({
    customer: facturapiCustomerId
  });

  return invoiceSearch.data;
});

// Fetch the Facturapi org key for a given escuela
Parse.Cloud.define("fetchFacturapiOrgKey", async (request) => {
  const { escuelaId } = request.params;

  // Validate required parameters
  if (!escuelaId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, "escuelaId is required");
  }

  // Fetch the escuela
  const Escuela = Parse.Object.extend("Escuela");
  const queryEscuela = new Parse.Query(Escuela);
  const escuelaObj = await queryEscuela.get(escuelaId);

  if (!escuelaObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Escuela not found");
  }

  // Fetch the escuela subscription
  const Subscripcion = Parse.Object.extend("Subscripcion");
  const querySubscripcion = new Parse.Query(Subscripcion);
  querySubscripcion.equalTo("escuela", escuelaObj);
  const subscripcionObj = await querySubscripcion.first();

  if (!subscripcionObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Subscripcion not found for escuela");
  }

  const facturapiOrgKey = subscripcionObj.get("facturapiOrgKey");

  if (!facturapiOrgKey) {
    return { facturapiOrgKey: null };
  }

  return { facturapiOrgKey };
});

// Send push notification when a new factura is created
Parse.Cloud.define("notifyNewFacturaCreated", async (request) => {
  const { facturapiCustomerId, escuelaId, folioNumber, total } = request.params;

  // Validate required parameters
  if (!facturapiCustomerId || !escuelaId) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, "facturapiCustomerId and escuelaId are required");
  }

  // Find the estudiante associated with this Facturapi customer
  const FacturapiRecord = Parse.Object.extend("Facturapi");
  const queryFacturapi = new Parse.Query(FacturapiRecord);
  queryFacturapi.equalTo("facturapiCustomerId", facturapiCustomerId);
  const facturapiObj = await queryFacturapi.first();

  if (!facturapiObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "No estudiante found for this Facturapi customer");
  }

  const estudianteId = facturapiObj.get("estudiante");

  // Fetch the estudiante to get push tokens
  const Estudiante = Parse.Object.extend("Estudiantes");
  const queryEstudiante = new Parse.Query(Estudiante);
  const estudianteObj = await queryEstudiante.get(estudianteId);

  if (!estudianteObj) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Estudiante not found");
  }

  const expoPushTokens = estudianteObj.get("expoPushToken") || [];

  if (expoPushTokens.length === 0) {
    return { success: true, message: "No push tokens registered for this estudiante", notificationsSent: 0 };
  }

  // Build notification message
  const estudianteNombre = `${estudianteObj.get("NOMBRE") || ""} ${estudianteObj.get("APELLIDO") || ""}`.trim();
  const totalFormatted = total ? `$${total.toLocaleString("es-MX")}` : "";

  const notificationTitle = "Nueva Factura Disponible";
  const notificationBody = folioNumber
    ? `Se ha emitido la factura ${folioNumber}${totalFormatted ? ` por ${totalFormatted}` : ""} para ${estudianteNombre}`
    : `Se ha emitido una nueva factura${totalFormatted ? ` por ${totalFormatted}` : ""} para ${estudianteNombre}`;

  // Send push notifications via Expo Push API
  const messages = expoPushTokens
    .filter(token => token && token.startsWith("ExponentPushToken"))
    .map(token => ({
      to: token,
      sound: "default",
      title: notificationTitle,
      body: notificationBody,
      data: {
        type: "factura",
        escuelaId: escuelaId,
        estudianteId: estudianteId
      },
    }));

  if (messages.length === 0) {
    return { success: true, message: "No valid Expo push tokens found", notificationsSent: 0 };
  }

  // Send to Expo Push API
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Expo Push API error:", result);
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, "Failed to send push notifications");
  }

  return {
    success: true,
    message: "Push notifications sent successfully",
    notificationsSent: messages.length,
    result: result
  };
});