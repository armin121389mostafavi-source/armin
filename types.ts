export enum ConfigProtocol {
  VMESS = 'VMess',
  VLESS = 'VLESS',
  TROJAN = 'Trojan',
  SHADOWSOCKS = 'Shadowsocks',
  TUIC = 'TUIC',
  HYSTERIA = 'Hysteria',
  WIREGUARD = 'WireGuard',
  UNKNOWN = 'Unknown'
}

export type Operator = 'MCI' | 'Irancell' | 'TCI' | 'RighTel' | 'All' | 'Unknown';

export interface ConfigAnalysis {
  protocol: ConfigProtocol;
  alias: string;
  server: string;
  port: string | number;
  location: string;
  security: 'High' | 'Medium' | 'Low';
  tags: string[];
  isp: Operator;
  avgPing: number | null;
}

export interface ConfigItem extends ConfigAnalysis {
  id: string;
  raw: string;
  addedAt: number;
}
