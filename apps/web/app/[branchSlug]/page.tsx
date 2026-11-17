'use client';

import { useParams } from 'next/navigation';
import TenantLandingPage from '../components/TenantLandingPage';

/**
 * Domain cabang: {tenant}.mnilab.my.id/{cabang}
 * Tampilan identik dengan halaman utama perusahaan; yang berbeda hanya data cabang
 * (jam buka, keterangan, harga) dan bagian "Pilih Cabang" berubah menjadi "Cek Nota".
 */
export default function BranchTrackingPage() {
  const params = useParams<{ branchSlug?: string }>();
  let slug = String(params?.branchSlug || '');
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // biarkan slug mentah bila format URL tidak valid
  }
  return <TenantLandingPage key={slug} branchSlug={slug} />;
}
