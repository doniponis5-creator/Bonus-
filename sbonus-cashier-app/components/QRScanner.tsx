/**
 * QRScanner — Сканер QR кодов через expo-camera.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { COLORS } from '@/constants/theme';

interface Props {
  onScan: (data: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return <View style={styles.container}><Text style={styles.text}>Загрузка...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>📷 Нужен доступ к камере</Text>
        <Text style={styles.subText}>Для сканирования QR кода клиента</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Разрешить камеру</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Отмена</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    onScan(data);
  };

  return (
    <View style={styles.scannerContainer}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.topOverlay} />
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          <Text style={styles.scanText}>📱 Наведите камеру на QR код клиента</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>✕ Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const FRAME_SIZE = 250;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 40 },
  text: { color: COLORS.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subText: { color: COLORS.text2, fontSize: 14, marginTop: 8, textAlign: 'center' },
  btn: {
    marginTop: 24, backgroundColor: COLORS.accent, paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 14,
  },
  btnText: { color: COLORS.bg, fontSize: 16, fontWeight: '700' },
  closeBtn: { marginTop: 16, padding: 12 },
  closeBtnText: { color: COLORS.text2, fontSize: 14 },

  scannerContainer: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  topOverlay: { flex: 1, backgroundColor: COLORS.overlay },
  middleRow: { flexDirection: 'row', height: FRAME_SIZE },
  sideOverlay: { flex: 1, backgroundColor: COLORS.overlay },
  scanFrame: { width: FRAME_SIZE, height: FRAME_SIZE },
  bottomOverlay: { flex: 1, backgroundColor: COLORS.overlay, alignItems: 'center', paddingTop: 30 },
  scanText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  cancelBtn: {
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 28,
    backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  cancelBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },

  corner: { position: 'absolute', width: 30, height: 30, borderColor: COLORS.accent },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
});
