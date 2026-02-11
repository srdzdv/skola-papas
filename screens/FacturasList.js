import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
const Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import {
  SafeAreaView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Text,
  Pressable,
  View,
  Dimensions,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

const screenWidth = Dimensions.get('window').width;

// Hoist currency formatter to module scope (best practice)
const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

// Memoized list item component - pass primitives for effective memoization
const FacturaItem = memo(function FacturaItem({
  id,
  folio,
  total,
  status,
  createdAt,
  customerName,
  productDescriptions,
  onDownload,
  isDownloading,
}) {
  const handleDownload = useCallback(() => {
    onDownload(id);
  }, [id, onDownload]);

  const isPagada = status === 'valid';
  const isCancelada = status === 'canceled';

  const statusLabel = isPagada ? 'Timbrada' : isCancelada ? 'Cancelada' : 'Pendiente';
  const statusStyle = isPagada
    ? styles.statusTimbrada
    : isCancelada
    ? styles.statusCancelada
    : styles.statusPendiente;

  // Parse product descriptions from string back to array
  const descriptions = productDescriptions ? productDescriptions.split('|||') : [];

  return (
    <View style={styles.listCard}>
      <View style={styles.rowView}>
        <Text style={styles.folioText}>Folio: {folio}</Text>
        <Text style={statusStyle}>{statusLabel}</Text>
      </View>
      <Text style={styles.totalText}>{currencyFormatter.format(total)}</Text>
      {descriptions.length > 0 ? (
        <View style={styles.descriptionsContainer}>
          {descriptions.map((desc, index) => (
            <Text key={index} style={styles.descriptionText}>• {desc}</Text>
          ))}
        </View>
      ) : null}
      <View style={styles.rowView}>
        <Text style={styles.cardText}>{customerName}</Text>
      </View>
      <View style={styles.rowView}>
        <Text style={styles.dateText}>{createdAt}</Text>
        {isPagada ? (
          <Pressable
            onPress={handleDownload}
            disabled={isDownloading}
            style={styles.downloadBtn}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color={Colors.actionColor} />
            ) : (
              <View style={styles.downloadBtnContent}>
                <Ionicons name="arrow-down-circle-outline" size={16} color="white" />
                <Text style={styles.downloadBtnText}>Descargar ZIP</Text>
              </View>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

export default function FacturasList({ navigation, route }) {
  // Extract params
  const { escuelaId, estudiantes } = route.params ?? {};

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([]);
  const [hasData, setHasData] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');

  // Refs for stable data access
  const dataMapRef = useRef(new Map());
  const facturapiOrgKeyRef = useRef(null);

  // Fetch invoices on mount
  useEffect(() => {
    if (escuelaId && estudiantes?.length > 0) {
      fetchAllFacturas();
    } else {
      setIsLoading(false);
      setHasData(false);
      setError("No se encontraron estudiantes asociados.");
    }
  }, [escuelaId, estudiantes]);

  const fetchFacturapiOrgKey = async () => {
    try {
      const result = await Parse.Cloud.run("fetchFacturapiOrgKey", {
        escuelaId: escuelaId,
      });
      return result?.facturapiOrgKey || null;
    } catch (err) {
      console.log("Error fetching facturapiOrgKey:", err);
      return null;
    }
  };

  const fetchAllFacturas = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch facturapiOrgKey and invoices in parallel
      const [orgKey, ...invoiceResults] = await Promise.all([
        fetchFacturapiOrgKey(),
        ...estudiantes.map((estudiante) => fetchFacturasForEstudiante(estudiante))
      ]);

      facturapiOrgKeyRef.current = orgKey;

      const results = invoiceResults;

      // Aggregate all invoices into a single list
      const allFacturas = results.flat();

      if (allFacturas.length === 0) {
        setHasData(false);
        setIsLoading(false);
        return;
      }

      // Sort by date descending (most recent first)
      allFacturas.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));

      // Build data map for quick lookup
      const newDataMap = new Map();
      allFacturas.forEach((factura) => {
        newDataMap.set(factura.id, factura);
      });

      dataMapRef.current = newDataMap;
      setData(allFacturas);
      setHasData(true);
      setIsLoading(false);

      trackEvent("facturas_loaded", {
        escuela: escuelaId,
        count: allFacturas.length,
      });
    } catch (err) {
      console.log("Error fetching facturas:", err);
      setError("No fue posible cargar las facturas. Intenta de nuevo.");
      setIsLoading(false);
      setHasData(false);
    }
  };

  const fetchFacturasForEstudiante = async (estudiante) => {
    try {
      const estudianteId = estudiante.object?.id;
      const estudianteNombre = estudiante.nombre;

      if (!estudianteId) {
        return [];
      }

      const result = await Parse.Cloud.run("fetchCustomerListaFacturas", {
        estudianteId: estudianteId,
        escuelaId: escuelaId,
      });

      // Handle error response from cloud function
      if (result?.error) {
        console.log(`No invoices for ${estudianteNombre}: ${result.error}`);
        return [];
      }

      // Map the invoice data to our format
      if (!Array.isArray(result)) {
        return [];
      }

      return result.map((invoice) => {
        // Extract product descriptions from items
        const productDescriptions = (invoice.items || [])
          .map(item => item.product?.description)
          .filter(Boolean);

        return {
          id: invoice.id,
          folio: invoice.folio_number || invoice.series || 'N/A',
          total: invoice.total || 0,
          status: invoice.status || 'pending',
          createdAt: dayjs(invoice.created_at).format('DD MMM YYYY, HH:mm'),
          rawDate: invoice.created_at,
          customerName: estudianteNombre,
          estudianteId: estudianteId,
          productDescriptions: productDescriptions,
          rawInvoice: invoice,
        };
      });
    } catch (err) {
      console.log("Error fetching facturas for estudiante:", err);
      return [];
    }
  };

  const handleDownload = useCallback(async (itemId) => {
    const item = dataMapRef.current.get(itemId);
    if (!item) {
      return;
    }

    const facturapiOrgKey = facturapiOrgKeyRef.current;

    // Validate required data
    if (!item.id) {
      Alert.alert("Error", "No se puede descargar la factura. ID no disponible.");
      return;
    }

    if (!facturapiOrgKey) {
      Alert.alert("Error", "No se puede descargar la factura. Clave de API no disponible. Contacta a tu escuela.");
      return;
    }

    // Haptic feedback on start
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setDownloadingId(itemId);
    setProcessingMessage("Descargando factura...");
    setIsProcessing(true);

    try {
      // Generate filename and local path
      const fileName = `factura-${item.folio || item.id}.zip`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      // Download the ZIP file from Facturapi
      const downloadResult = await FileSystem.downloadAsync(
        `https://www.facturapi.io/v2/invoices/${item.id}/zip`,
        fileUri,
        {
          headers: {
            Authorization: `Bearer ${facturapiOrgKey}`,
          },
        }
      );

      // Check for HTTP errors
      if (downloadResult.status !== 200) {
        throw new Error(`Error HTTP: ${downloadResult.status}`);
      }

      // Share the downloaded file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadResult.uri);
      } else {
        Alert.alert("Descargado", "La factura se ha guardado en el dispositivo.");
      }

      // Success haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      trackEvent("factura_downloaded", {
        escuela: escuelaId,
        folio: item.folio,
      });

    } catch (err) {
      console.error("Error downloading invoice:", err);

      let errorMessage = "Hubo un problema al descargar la factura.";
      if (err.message?.includes("Network")) {
        errorMessage = "Verifica tu conexión a internet e intenta de nuevo.";
      } else if (err.message) {
        errorMessage = `${errorMessage} ${err.message}`;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setDownloadingId(null);
      setIsProcessing(false);
    }
  }, [escuelaId]);

  // Memoized renderItem - pass only primitives to enable memo() comparison
  const renderItem = useCallback(({ item }) => (
    <FacturaItem
      id={item.id}
      folio={item.folio}
      total={item.total}
      status={item.status}
      createdAt={item.createdAt}
      customerName={item.customerName}
      productDescriptions={item.productDescriptions?.join('|||') || ''}
      onDownload={handleDownload}
      isDownloading={downloadingId === item.id}
    />
  ), [handleDownload, downloadingId]);

  // Stable keyExtractor using unique ID
  const keyExtractor = useCallback((item) => item.id, []);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={goBack}>
          <Text style={styles.backBtnText}>{"< Regresar"}</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <Text style={styles.titleText}>Facturación</Text>
          {hasData && !isLoading && !error ? (
            <Text style={styles.countText}>{data.length} factura{data.length !== 1 ? 's' : ''}</Text>
          ) : null}
        </View>
        <View style={styles.dividerView} />

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Cargando facturas...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyStateView}>
            <Text style={styles.emptyStateText}>{error}</Text>
            <Pressable onPress={fetchAllFacturas} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : hasData ? (
          <View style={styles.listWrapper}>
            <FlashList
              data={data}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              estimatedItemSize={100}
              contentContainerStyle={styles.flatlistContent}
            />
          </View>
        ) : (
          <View style={styles.emptyStateView}>
            <Text style={styles.emptyStateText}>
              Aquí van a aparecer las facturas que tu escuela te ha emitido. Si requieres facturar algo, por favor contacta a tu escuela.
            </Text>
          </View>
        )}

        {isProcessing ? (
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color={Colors.bluejeansDark} />
              <Text style={styles.processingText}>{processingMessage}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bluejeansDark,
  },
  header: {
    flex: 1,
    backgroundColor: Colors.bluejeansDark,
    paddingTop: Platform.OS === 'ios' ? 8 : 28,
    paddingHorizontal: 16,
  },
  backBtnText: {
    color: Colors.actionColor,
    fontWeight: '500',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  dividerView: {
    height: 2,
    backgroundColor: Colors.aquaDark,
    marginBottom: 12,
  },
  countText: {
    color: 'white',
    fontSize: 14,
  },
  listWrapper: {
    flex: 1,
    backgroundColor: Colors.bluejeansDark,
  },
  flatlistContent: {
    paddingBottom: 20,
  },
  listCard: {
    backgroundColor: 'white',
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    gap: 4,
  },
  rowView: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folioText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkGrayDark,
  },
  totalText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.grassDark,
  },
  descriptionsContainer: {
    marginTop: 4,
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 13,
    color: Colors.darkGrayDark,
    marginBottom: 2,
  },
  cardText: {
    fontSize: 13,
    color: Colors.darkGrayLight,
  },
  dateText: {
    fontSize: 12,
    color: Colors.darkGrayLight,
  },
  statusTimbrada: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.grassDark,
  },
  statusCancelada: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.bittersweetDark,
  },
  statusPendiente: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.sunflowerDark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'white',
    fontSize: 14,
  },
  emptyStateView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  emptyStateText: {
    color: 'white',
    fontSize: 15,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.aquaDark,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: 'white',
    fontWeight: '600',
  },
  downloadBtn: {
    backgroundColor: Colors.bluejeansDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 100,
    alignItems: 'center',
  },
  downloadBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  downloadBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 200,
    gap: 16,
  },
  processingText: {
    color: Colors.darkGrayDark,
    textAlign: 'center',
    fontSize: 14,
  },
});
