export interface IOnlineAccessUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  accountOwner: boolean;
  locale: string;
  collaborator: boolean;
}

export interface IOnlineAccessInfo {
  expiresIn: number;
  associatedUserScope: string;
  associatedUser: IOnlineAccessUser;
}

export interface ISession {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string;
  expires?: Date;
  accessToken?: string;
  onlineAccessInfo?: IOnlineAccessInfo;
}
