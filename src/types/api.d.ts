export {}

declare global {
  declare namespace Api {
    namespace Tms {
      namespace BasicData {
        type CustomerAddressType = 'shipping' | 'receiving'
        type CustomerFieldKey = 'contactPhone' | 'addressDetail' | 'taxNo' | 'bankAccount'
        type CustomerFieldAccessMap = Partial<Record<CustomerFieldKey, FieldAccessLevel>>
        type CustomerAddressFieldKey = 'contactPhone' | 'addressDetail'
        type CustomerAddressFieldAccessMap = Partial<
          Record<CustomerAddressFieldKey, FieldAccessLevel>
        >
        type CarrierFieldKey =
          'contactPhone' | 'addressDetail' | 'taxNo' | 'bankAccount' | 'attachments'
        type CarrierFieldAccessMap = Partial<Record<CarrierFieldKey, FieldAccessLevel>>
        type DriverFieldKey =
          'contactPhone' | 'idCardNo' | 'homeAddress' | 'emergencyContact' | 'identityDocuments'
        type DriverFieldAccessMap = Partial<Record<DriverFieldKey, FieldAccessLevel>>
        type SensitiveNumber = number | string | null
        type CarrierPriceFieldKey = 'contactPhones' | 'costAmounts' | 'paymentAmounts'
        type CarrierPriceFieldAccessMap = Partial<Record<CarrierPriceFieldKey, FieldAccessLevel>>
        type CustomerPriceFieldKey =
          'contactPhones' | 'addressDetails' | 'quoteAmounts' | 'paymentAmounts'
        type CustomerPriceFieldAccessMap = Partial<Record<CustomerPriceFieldKey, FieldAccessLevel>>

        /** VMS 通过只读集成契约提供给 TMS 的最小车辆视图。 */
        interface VehicleReferenceOption {
          id?: string
          carrierId?: string | null
          plateNo: string
          companyName?: string
          vin?: string
          selfNo?: string
          vehicleType?: string
          fieldAccess?: Record<string, Api.System.FieldPermissionAccessLevel>
          isRecordOwner?: boolean
        }

        interface Customer {
          id?: string
          tenantId?: string
          parentUnitId?: string | null
          groupId?: string | null
          customerCode?: string
          customerName: string
          industry?: string
          customerLevel?: string
          tags?: string[]
          region?: string
          regionAdcode?: string | null
          addressDetail?: string
          longitude?: number | string | null
          latitude?: number | string | null
          coordinateSystem?: string | null
          coordinateSource?: string | null
          coordinateStatus?: string | null
          geocodeProvider?: string | null
          geocodedAt?: string | null
          postalCode?: string
          enabled?: boolean
          contactName?: string
          contactPhone?: string
          contactDepartment?: string
          contactPosition?: string
          contactEmail?: string
          contactQq?: string
          invoiceTitle?: string
          taxNo?: string
          bankName?: string
          bankAccount?: string
          remark?: string
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: CustomerFieldAccessMap
          isRecordOwner?: boolean
        }

        type CustomerSearchParams = Partial<
          Pick<Customer, 'customerLevel' | 'industry' | 'enabled'> &
            Api.Common.CommonSearchParams & {
              customerId?: string
              groupIds?: string[]
              keyword?: string
              createTimeRange?: string[]
            }
        >

        interface CustomerOption {
          id: string
          tenantId?: string
          customerCode?: string
          customerName: string
          enabled?: boolean
          contactName?: string
          contactPhone?: string
          region?: string
          regionAdcode?: string | null
          addressDetail?: string
          longitude?: number | string | null
          latitude?: number | string | null
          coordinateSystem?: string | null
          coordinateSource?: string | null
          coordinateStatus?: string | null
          geocodeProvider?: string | null
          geocodedAt?: string | null
          postalCode?: string
          fieldAccess?: CustomerFieldAccessMap
          isRecordOwner?: boolean
        }

        interface CustomerAddress {
          id?: string
          tenantId?: string
          customerId: string | null
          addressType: CustomerAddressType
          partyName?: string | null
          addressShortName?: string | null
          businessHoursStart?: string | null
          businessHoursEnd?: string | null
          contactName: string
          contactPhone: string
          region: string
          regionAdcode?: string | null
          addressDetail: string
          longitude?: number | string | null
          latitude?: number | string | null
          coordinateSystem?: string | null
          coordinateSource?: string | null
          coordinateStatus?: string | null
          geocodeProvider?: string | null
          geocodedAt?: string | null
          geofenceEnabled?: boolean
          geofenceRadiusM?: number | null
          geofenceUpdatedAt?: string | null
          postalCode?: string
          isDefault?: boolean
          remark?: string
          customer?: CustomerOption | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: CustomerAddressFieldAccessMap
          isRecordOwner?: boolean
        }

        type CustomerAddressSearchParams = Partial<
          Pick<CustomerAddress, 'customerId' | 'addressType'> &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        interface FavoriteRoute {
          id?: string
          tenantId?: string
          tenant?: Pick<Api.SystemManage.TenantListItem, 'id' | 'tenantCode' | 'tenantName'> | null
          routeName: string
          customerId: string
          customer?: CustomerOption | null
          originAddressId: string
          originAddress?: CustomerAddress | null
          destinationAddressId: string
          destinationAddress?: CustomerAddress | null
          distanceKm?: number | string | null
          estimatedMinutes?: number | null
          enabled: boolean
          remark?: string | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
        }

        type FavoriteRouteSearchParams = Partial<
          Pick<FavoriteRoute, 'tenantId' | 'customerId' | 'enabled'> &
            Api.Common.CommonSearchParams & {
              keyword?: string
            }
        >

        interface CustomerPriceCargoItem {
          cargoName?: string | null
          quantity?: number | null
          unit?: string | null
          volumeM3?: number | null
          weightKg?: number | null
        }

        interface CustomerPrice {
          id?: string
          tenantId?: string
          customerId: string
          customer?: CustomerOption | null
          originRegion: string
          destinationRegion: string
          transportType: string
          cargoType?: string | null
          shippingAddressId?: string | null
          receivingAddressId?: string | null
          shippingContactName?: string | null
          shippingContactPhone?: string | null
          shippingAddressDetail?: string | null
          shippingLongitude?: number | string | null
          shippingLatitude?: number | string | null
          receivingContactName?: string | null
          receivingContactPhone?: string | null
          receivingAddressDetail?: string | null
          receivingLongitude?: number | string | null
          receivingLatitude?: number | string | null
          cargoItems?: CustomerPriceCargoItem[]
          cargoQuantityTotal?: number | null
          cargoVolumeTotal?: number | null
          cargoWeightTotal?: number | null
          vehicleType?: string | null
          vehicleLength?: string | null
          vehicleCount?: number | null
          billingMethod: string
          transportFee?: SensitiveNumber
          insuranceFee?: SensitiveNumber
          packageFee?: SensitiveNumber
          loadingFee?: SensitiveNumber
          transferFee?: SensitiveNumber
          fuelFee?: SensitiveNumber
          serviceFee?: SensitiveNumber
          otherFee?: SensitiveNumber
          totalFee?: SensitiveNumber
          cashAmount?: SensitiveNumber
          prepaidAmount?: SensitiveNumber
          collectAmount?: SensitiveNumber
          periodicAmount?: SensitiveNumber
          paymentTotal?: SensitiveNumber
          remark?: string | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: CustomerPriceFieldAccessMap
          isRecordOwner?: boolean
        }

        type CustomerPriceSearchParams = Partial<
          Pick<
            CustomerPrice,
            | 'customerId'
            | 'originRegion'
            | 'destinationRegion'
            | 'transportType'
            | 'cargoType'
            | 'billingMethod'
          > &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        interface Carrier {
          id?: string
          tenantId?: string
          parentUnitId?: string | null
          carrierCode?: string
          companyName: string
          carrierType: string
          carrierTypes?: string[]
          dispatchChannel?: 'online' | 'offline'
          dispatchChannels?: ('online' | 'offline')[]
          businessLicenseNo?: string
          taxRegistrationNo?: string
          legalRepresentative?: string
          region?: string
          addressDetail?: string
          postalCode?: string
          enabled?: boolean
          businessLicenseUrl?: string
          driverCount?: number | null
          vehicleCount?: number | null
          contactName?: string
          contactPhone?: string
          contactDepartment?: string
          contactPosition?: string
          contactEmail?: string
          contactQq?: string
          invoiceTitle?: string
          taxNo?: string
          bankName?: string
          bankAccountName?: string
          bankAccount?: string
          signedContract?: boolean
          contractAttachmentUrl?: string
          remark?: string
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: CarrierFieldAccessMap
          isRecordOwner?: boolean
        }

        type CarrierSearchParams = Partial<
          Pick<Carrier, 'carrierType' | 'enabled' | 'signedContract'> &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        interface CarrierOption {
          id: string
          carrierCode?: string
          companyName: string
          enabled?: boolean
          contactName?: string
          contactPhone?: string
          fieldAccess?: CarrierFieldAccessMap
          isRecordOwner?: boolean
        }

        type CarrierPerformanceSeverity = 'critical' | 'high' | 'medium'
        type CarrierPerformanceRiskLevel = CarrierPerformanceSeverity | 'low'
        type CarrierCooperationStrategy =
          | 'manual_qualification_review'
          | 'conditional_cooperation'
          | 'improve_and_monitor'
          | 'preferred_partner'
          | 'insufficient_evidence'

        interface CarrierPerformanceSignal {
          type: string
          severity: CarrierPerformanceSeverity
          title: string
          detail: string
          evidence: string[]
        }

        interface CarrierPerformanceWaybill {
          id: string
          waybillNo: string
          route: string
          status: string
          freightAmount: number
          plannedUnloadTime: string | null
          arrivedAt: string | null
          riskScore: number
          reasons: string[]
        }

        interface CarrierPerformanceAssessment {
          carrierId: string
          carrierCode: string
          companyName: string
          riskLevel: CarrierPerformanceRiskLevel
          riskScore: number
          performanceScore: number
          confidence: number
          cooperationStrategy: CarrierCooperationStrategy
          summary: string
          signals: CarrierPerformanceSignal[]
          riskWaybills: CarrierPerformanceWaybill[]
          recommendedActions: string[]
          limitations: string[]
          metrics: {
            waybillCount: number
            completedCount: number
            cancelledCount: number
            activeCount: number
            completionRate: number
            cancellationRate: number
            onTimeRate: number | null
            onTimeSampleCount: number
            routeCount: number
            totalFreightAmount: number
            totalCostAmount: number
            costToFreightRate: number | null
            pendingCostCount: number
            rejectedCostCount: number
            openStatementCount: number
            driverCount: number
            vehicleCount: number
            daysSinceLastWaybill: number | null
          }
        }

        interface CarrierPerformanceAdvisorResponse {
          runId: string
          ruleVersion: string
          generatedAt: string
          assessment: CarrierPerformanceAssessment
        }

        interface CarrierPriceCargoItem {
          orderNo?: string | null
          originRegion?: string | null
          destinationRegion?: string | null
          cargoName?: string | null
          quantity?: number | null
          unit?: string | null
          volumeM3?: number | null
          weightKg?: number | null
          splitTransportFee?: SensitiveNumber
          loadingFee?: SensitiveNumber
          packageFee?: SensitiveNumber
        }

        interface CarrierPrice {
          id?: string
          tenantId?: string
          quoteNo: string
          carrierId: string
          carrier?: CarrierOption | null
          driverId?: string | null
          driver?: DriverOption | null
          vehicleId?: string | null
          vehicle?: VehicleReferenceOption | null
          originRegion: string
          destinationRegion: string
          transportMode: string
          contactName?: string | null
          contactPhone?: string | null
          driverName?: string | null
          driverPhone?: string | null
          plateNo?: string | null
          vehicleType?: string | null
          vehicleLength?: string | null
          cargoItems?: CarrierPriceCargoItem[]
          cargoQuantityTotal?: number | null
          cargoVolumeTotal?: number | null
          cargoWeightTotal?: number | null
          billingMethod: string
          transportCost?: SensitiveNumber
          splitTransportFee?: SensitiveNumber
          loadingFee?: SensitiveNumber
          packageFee?: SensitiveNumber
          otherFee?: SensitiveNumber
          totalFee?: SensitiveNumber
          cashAmount?: SensitiveNumber
          prepaidAmount?: SensitiveNumber
          collectAmount?: SensitiveNumber
          periodicAmount?: SensitiveNumber
          paymentTotal?: SensitiveNumber
          remark?: string | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: CarrierPriceFieldAccessMap
          isRecordOwner?: boolean
        }

        type CarrierPriceSearchParams = Partial<
          Pick<
            CarrierPrice,
            'carrierId' | 'originRegion' | 'destinationRegion' | 'transportMode' | 'billingMethod'
          > &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        interface Driver {
          id?: string
          tenantId?: string
          employeeId?: string | null
          carrierId: string
          driverName: string
          phone?: string
          gender: string
          idCardNo?: string
          licenseType: string
          driverType: 'primary' | 'secondary'
          licenseExpireDate?: string | null
          homeAddress?: string
          emergencyContactName?: string
          emergencyContactPhone?: string
          enabled?: boolean
          idCardFrontUrl?: string | null
          idCardBackUrl?: string | null
          driverLicenseFrontUrl?: string | null
          driverLicenseBackUrl?: string | null
          remark?: string
          carrier?: CarrierOption | null
          assignedVehicles?: DriverAssignedVehicle[]
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: DriverFieldAccessMap
          isRecordOwner?: boolean
        }

        interface DriverEmployeeOption {
          id: string
          tenantId: string
          tenant: Pick<Api.SystemManage.TenantListItem, 'id' | 'tenantCode' | 'tenantName'>
          employeeNo: string
          employeeName: string
          organizationId?: string | null
          organization?: Pick<
            Api.SystemManage.OrganizationListItem,
            'id' | 'organizationCode' | 'organizationName'
          > | null
          jobTitle?: string | null
          employmentStatus: string
          gender?: string | null
          phone?: string | null
          idCardNo?: string | null
          homeAddress?: string | null
          emergencyContactName?: string | null
          emergencyContactPhone?: string | null
        }

        interface DriverAssignedVehicle {
          id: string
          carrierId?: string | null
          plateNo: string
        }

        type DriverSearchParams = Partial<
          Pick<Driver, 'carrierId' | 'driverType' | 'gender' | 'enabled'> &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        interface DriverOption {
          id: string
          carrierId?: string | null
          driverName: string
          phone?: string
          driverType?: 'primary' | 'secondary'
          licenseType?: string
          licenseExpireDate?: string | null
          enabled?: boolean
          fieldAccess?: DriverFieldAccessMap
          isRecordOwner?: boolean
        }

        interface Cargo {
          id?: string
          tenantId?: string
          materialId?: string | null
          materialGroupId?: string | null
          material?: {
            id: string
            materialCode: string
            materialName: string
            specificationModel?: string | null
            basicUnit: string
            materialGroupId?: string | null
            baseUnit?: { unitName: string; symbol?: string | null } | null
          } | null
          cargoCode?: string
          cargoName: string
          specModel?: string | null
          unit: string
          lengthM?: number | null
          widthM?: number | null
          heightM?: number | null
          volumeM3?: number | null
          weightKg?: number | null
          valueAmount?: number | null
          enabled?: boolean
          remark?: string | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
        }

        type CargoSearchParams = Partial<
          Pick<Cargo, 'enabled'> &
            Api.Common.CommonSearchParams & {
              tenantId?: string
              materialGroupIds?: string[]
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        type ContractStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'terminated'
        type ContractBusinessType = 'customer' | 'carrier'
        type FieldAccessLevel = 'hidden' | 'masked' | 'read' | 'edit'
        type ContractFieldKey =
          | 'contractAmount'
          | 'transportUnitPrice'
          | 'roadConsumptionRate'
          | 'lossDeductionPrice'
          | 'transportDetailsPricing'
          | 'partyContactPhone'
          | 'attachments'
        type ContractFieldAccessMap = Partial<Record<ContractFieldKey, FieldAccessLevel>>

        interface ContractAttachment {
          name: string
          url?: string
          fileType?: string
          fileSize?: string
        }

        interface ContractTransportDetail {
          cargoId?: string | null
          cargoDescription: string
          cargoCode: string
          contractQuantity: number
          unit: string
          transportUnitPrice?: SensitiveNumber
          freight?: SensitiveNumber
        }

        interface Contract {
          id?: string
          tenantId?: string
          contractNo?: string
          contractName: string
          contractStatus?: ContractStatus
          paperContractNo?: string | null
          mnemonicCode?: string | null
          contractCategory: string
          transportMode: string
          businessContractType: ContractBusinessType
          customerId?: string | null
          customer?: CustomerOption | null
          carrierId?: string | null
          partyContactPhone?: string | null
          contactName?: string | null
          waybillNo?: string | null
          customerSignatory?: string | null
          billingMethod: string
          contractAmount?: SensitiveNumber
          transportUnitPrice?: SensitiveNumber
          roadConsumptionRate?: SensitiveNumber
          lossDeductionPrice?: SensitiveNumber
          signTime: string
          effectiveDate?: string | null
          expiryDate?: string | null
          isCompleted: boolean
          agreedTransportQuantity?: number | null
          transportRoute?: string | null
          shipperName?: string | null
          payerName?: string | null
          consigneeName?: string | null
          specialTransportRequirements?: string | null
          otherDeductionTerms?: string | null
          handler: string
          contractDescription?: string | null
          transportDetails: ContractTransportDetail[]
          attachments?: ContractAttachment[]
          carrier?: CarrierOption | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: ContractFieldAccessMap
          isRecordOwner?: boolean
        }

        type ContractSearchParams = Partial<
          Pick<
            Contract,
            | 'contractStatus'
            | 'businessContractType'
            | 'contractCategory'
            | 'customerId'
            | 'carrierId'
            | 'billingMethod'
          > &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
              recordId?: string
            }
        >

        interface ContractDetailSelectorItem extends Omit<
          ContractTransportDetail,
          'transportUnitPrice' | 'freight'
        > {
          key: string
          contractId: string
          contractNo: string
          contractName: string
          effectiveDate?: string | null
          expiryDate?: string | null
          transportUnitPrice: number | null
          freight: number | null
        }

        interface ContractDetailSelectorSearchParams extends Api.Common.CommonSearchParams {
          keyword?: string
        }
      }

      namespace Order {
        type OrderFieldKey =
          | 'shipperContact'
          | 'shipperAddress'
          | 'receiverContact'
          | 'receiverAddress'
          | 'cargoPricing'
          | 'freightAmounts'
          | 'settlementAmounts'
          | 'driverPhone'
          | 'proofAttachments'
          | 'routeCoordinates'
        type OrderFieldAccessMap = Partial<
          Record<OrderFieldKey, Api.Tms.BasicData.FieldAccessLevel>
        >

        interface StationOption {
          id: string
          stationCode: string
          stationName: string
          stationType: string
          stationRoles?: Api.Tms.Station.StationRoleRecord[]
          regionCode?: string | null
        }

        interface CustomerSelectorItem {
          id: string
          customerCode?: string
          customerName: string
          addressId?: string | null
          addressType?: Api.Tms.BasicData.CustomerAddressType
          contactName?: string
          contactPhone?: string
          region?: string
          regionAdcode?: string | null
          addressDetail?: string
          longitude?: number | string | null
          latitude?: number | string | null
          fieldAccess?:
            | Api.Tms.BasicData.CustomerFieldAccessMap
            | Api.Tms.BasicData.CustomerAddressFieldAccessMap
          isRecordOwner?: boolean
        }

        interface CargoItem {
          cargoId?: string | null
          cargoName?: string | null
          cargoCode?: string | null
          specModel?: string | null
          remark?: string | null
          packageType?: string | null
          quantity?: number | null
          unit?: string | null
          weightKg?: number | null
          volumeM3?: number | null
          unitPrice?: number | string | null
          freight?: number | string | null
          sourceContractId?: string | null
          sourceContractNo?: string | null
          sourceContractName?: string | null
          sourceContractDetailKey?: string | null
        }

        interface AiOrderOption {
          label: string
          value: string
        }

        interface AiOrderAnalyzeRequest {
          action?: 'analyze'
          prompt?: string
          imageUrls?: string[]
          options?: {
            deliveryMethods?: AiOrderOption[]
            paymentMethods?: AiOrderOption[]
            transportModes?: AiOrderOption[]
            cargoUnits?: AiOrderOption[]
            loadTypes?: AiOrderOption[]
            billingModes?: AiOrderOption[]
            cargoCategories?: AiOrderOption[]
            packagingOptions?: AiOrderOption[]
            transportRequirements?: AiOrderOption[]
            trackingMethods?: AiOrderOption[]
          }
        }

        interface AiOrderExampleRequest {
          options?: AiOrderAnalyzeRequest['options']
        }

        interface AiOrderExampleResponse {
          prompt: string
        }

        interface AiOrderDraft {
          originStationName?: string | null
          destinationStationName?: string | null
          transferStationName?: string | null
          deliveryMethod?: string | null
          shippingCustomerName?: string | null
          shippingContactName?: string | null
          shippingContactPhone?: string | null
          shippingAddressDetail?: string | null
          receivingCustomerName?: string | null
          receivingContactName?: string | null
          receivingContactPhone?: string | null
          receivingAddressDetail?: string | null
          cargoItems?: CargoItem[]
          transportFee?: number | null
          deliveryFee?: number | null
          unloadingFee?: number | null
          collectPaymentFee?: number | null
          transferFee?: number | null
          declaredValue?: number | null
          insuranceFee?: number | null
          packageFee?: number | null
          otherFee?: number | null
          paymentMethod?: string | null
          cashAmount?: number | null
          collectAmount?: number | null
          monthlyAmount?: number | null
          codAmount?: number | null
          handlingFee?: number | null
          transportMode?: string | null
          orderRemark?: string | null
          orderConfig?: AiOrderConfigDraft | null
        }

        interface AiOrderConfigDraft {
          loadType?: OrderConfig['loadType'] | null
          allowConsolidation?: boolean | null
          truckCount?: number | null
          billingMode?: OrderConfig['billingMode'] | null
          billingUnit?: string | null
          cargoCategory?: string | null
          tempMinC?: number | null
          tempMaxC?: number | null
          packaging?: string | null
          selfPickup?: boolean | null
          insured?: boolean | null
          transportRequirements?: string[] | null
          trackingMethod?: string | null
          trackingNumber?: string | null
          remark?: string | null
        }

        interface AiOrderAnalyzeResponse {
          artifactId: string
          runId: string
          summary: string
          confidence: number
          fieldConfidence?: Record<string, number>
          missingFields: string[]
          warnings: string[]
          order: AiOrderDraft
        }

        interface AiOrderReviewRequest {
          action: 'review'
          artifactId: string
          entityId: string
          outcome: 'applied'
          finalPayload: AiOrderDraft
          reviewNote?: string
        }

        interface AiOrderReviewResponse {
          artifactId: string
          status: 'applied' | 'rejected'
          acceptedFields: string[]
          correctedFields: string[]
        }

        type AiOrderMasterDataTaskKind = 'station' | 'customer' | 'address' | 'cargo'

        interface AiOrderMasterDataCreateTask {
          key: string
          kind: AiOrderMasterDataTaskKind
          payload: Record<string, unknown>
        }

        interface AiOrderMasterDataCreateResult {
          key: string
          kind: AiOrderMasterDataTaskKind
          id: string
        }

        interface OrderRecord {
          id?: string
          tenantId?: string
          orderNo: string
          waybillNo?: string | null
          orderStatus?: string
          originStationId?: string | null
          destinationStationId?: string | null
          transferStationId?: string | null
          originStation: string
          destinationStation: string
          transferStation?: string | null
          originStationRef?: StationOption | null
          destinationStationRef?: StationOption | null
          transferStationRef?: StationOption | null
          deliveryMethod: string
          shippingCustomerId?: string | null
          receivingCustomerId?: string | null
          shippingAddressId?: string | null
          receivingAddressId?: string | null
          shippingCustomer?: CustomerSelectorItem | null
          receivingCustomer?: CustomerSelectorItem | null
          shippingContactName: string
          shippingContactPhone: string
          shippingAddressDetail: string
          shippingLongitude?: number | string | null
          shippingLatitude?: number | string | null
          receivingContactName: string
          receivingContactPhone: string
          receivingAddressDetail: string
          receivingLongitude?: number | string | null
          receivingLatitude?: number | string | null
          shippingRegionPath?: string[]
          receivingRegionPath?: string[]
          distanceKm?: number | string | null
          departureAt?: string | null
          arrivalAt?: string | null
          orderConfig?: OrderConfig
          cargoItems?: CargoItem[]
          cargoQuantityTotal?: number | null
          cargoWeightTotal?: number | null
          cargoVolumeTotal?: number | null
          transportFee?: number | string | null
          deliveryFee?: number | string | null
          unloadingFee?: number | string | null
          collectPaymentFee?: number | string | null
          transferFee?: number | string | null
          declaredValue?: number | string | null
          insuranceFee?: number | string | null
          packageFee?: number | string | null
          otherFee?: number | string | null
          totalFee?: number | string | null
          paymentMethod: string
          cashAmount?: number | string | null
          collectAmount?: number | string | null
          monthlyAmount?: number | string | null
          codAmount?: number | string | null
          handlingFee?: number | string | null
          paymentTotal?: number | string | null
          transportMode?: string | null
          orderRemark?: string | null
          imageUrls?: string[]
          signedCodAmount?: number | string | null
          receiptImageUrls?: string[]
          signedAt?: string | null
          relatedWaybills?: Waybill.RelatedWaybillSummary[]
          driverWaybillAcceptedAt?: string | null
          driverWaybillLoadedAt?: string | null
          driverWaybillDepartedAt?: string | null
          driverWaybillUnloadedAt?: string | null
          driverWaybillCompletedAt?: string | null
          driverWaybillSignedAt?: string | null
          driverWaybillSignedBy?: string | null
          driverWaybillSignatureProofCount?: number
          driverWaybillReturnTime?: string | null
          driverWaybillReturnOdometerKm?: number | null
          driverWaybillReturnPhotoCount?: number
          driverWaybillUnloadingStatus?: Waybill.CargoOperationStatus | null
          driverWaybillId?: string | null
          waybillStatus?: string | null
          dispatchStatus?: string
          dispatchVehicleId?: string | null
          dispatchDriverId?: string | null
          dispatchPlateNo?: string | null
          dispatchVehicleType?: string | null
          dispatchVehicleLength?: string | null
          dispatchDriverName?: string | null
          dispatchDriverPhone?: string | null
          plannedDepartureTime?: string | null
          plannedArrivalTime?: string | null
          dispatchRemark?: string | null
          dispatchedAt?: string | null
          dispatchBy?: string | null
          dispatchVehicle?: Waybill.DispatchVehicleOption | null
          dispatchDriver?: BasicData.DriverOption | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          fieldAccess?: OrderFieldAccessMap
          isRecordOwner?: boolean
        }

        interface OrderConfig {
          loadType: 'ltl' | 'ftl'
          allowConsolidation?: boolean
          vehicleType?: string
          vehicleLengthM?: number | null
          vehicleVolumeM3?: number | null
          vehicleLoadTons?: number | null
          truckCount?: number | null
          billingMode: 'weight' | 'volume' | 'quantity' | ''
          billingUnit: string
          cargoCategory: string
          tempMinC?: number | null
          tempMaxC?: number | null
          packaging: string
          selfPickup: boolean
          insured: boolean
          transportRequirements: string[]
          trackingMethod: string
          trackingNumber: string
          remark: string
          attachmentUrls: string[]
        }

        type OrderSearchParams = Partial<
          Pick<
            OrderRecord,
            | 'orderStatus'
            | 'paymentMethod'
            | 'originStationId'
            | 'destinationStationId'
            | 'transferStationId'
          > & {
            recordId?: string
            cargoKeyword?: string
            shippingKeyword?: string
            receivingKeyword?: string
            createTimeRange?: string[]
          }
        >

        type OrderFreightPayload = Pick<OrderRecord, 'id' | 'totalFee'>

        interface OrderQuoteItem {
          code: string
          amount: number
          remark: string
        }

        interface OrderQuotePayload {
          transportFee: number
          unloadingFee: number
          deliveryFee: number
          insuranceFee: number
          taxFee: number
          supplementaryItems: OrderQuoteItem[]
          prepayment: number
          arrivalPayment: number
          collectPayment: number
          remark: string
          attachmentUrls: string[]
        }

        interface OrderQuoteRecord extends OrderQuotePayload {
          id: string
          orderId: string
          status: 'draft' | 'submitted'
          totalAmount: number
          submittedAt: string | null
          createTime: string
          updateTime: string
        }

        interface OrderQuoteContext {
          order: OrderRecord
          quote: OrderQuoteRecord | null
        }

        type CustomerSelectorSearchParams = Api.Common.CommonSearchParams & {
          keyword?: string
          addressType?: Api.Tms.BasicData.CustomerAddressType
        }
      }

      namespace Waybill {
        type WaybillFieldKey = Api.Tms.Order.OrderFieldKey | 'carrierPhone'
        type WaybillFieldAccessMap = Partial<
          Record<WaybillFieldKey, Api.Tms.BasicData.FieldAccessLevel>
        >
        type DispatchStatus =
          'pending' | 'partial' | 'loaded' | 'transporting' | 'completed' | 'cancelled'
        type WaybillStatus =
          | 'pending'
          | 'accepted'
          | 'loading'
          | 'transporting'
          | 'unloading'
          | 'signed'
          | 'completed'
          | 'cancelled'
        interface WaybillRecord extends Api.Tms.Order.OrderRecord {
          sourceOrderId?: string | null
          sourceOrderNos?: string[]
          sourceOrderCount?: number
          executionKind?: 'single' | 'merge' | 'split'
          dispatchMode?: 'carrier' | 'self_operated' | 'individual_driver' | null
          remainingCargoItems?: Api.Tms.Order.CargoItem[]
          remainingQuantityTotal?: number
          remainingWeightTotal?: number
          remainingVolumeTotal?: number
          allocationCount?: number
          hasReceiptException?: boolean
        }

        interface DispatchAllocationLine {
          lineIndex: number
          quantity: number
          weightKg?: number
          volumeM3?: number
        }

        interface DispatchAllocation {
          orderId: string
          lines: DispatchAllocationLine[]
        }

        interface DispatchPlanExecution {
          dispatchMode?: 'carrier' | 'self_operated' | 'individual_driver'
          dispatchCarrierId?: string | null
          dispatchAgreementId?: string | null
          dispatchVehicleId?: string | null
          dispatchDriverId?: string | null
          plannedDepartureTime: string
          plannedArrivalTime: string
          dispatchRemark?: string | null
          receivingAddressId?: string | null
          allocations: DispatchAllocation[]
        }

        interface DispatchPlan {
          kind: 'single' | 'merge' | 'split'
          executions: DispatchPlanExecution[]
        }

        interface ExecutionSource {
          id: string
          orderId: string
          orderNo: string
          customerName?: string | null
          receivingAddress?: string | null
          cargoItems: Api.Tms.Order.CargoItem[]
          quantity: number
          weightKg: number
          volumeM3: number
          freightAmount?: number | null
          signedQuantity: number
          exceptionQuantity: number
          exceptionNote?: string | null
          signedAt?: string | null
          orderStatus: string
          dispatchStatus: string
        }

        interface RelatedWaybillSummary {
          id: string
          waybillNo: string
          status: WaybillStatus | string
          driverName?: string | null
          driverPhone?: string | null
          plateNo?: string | null
          acceptedAt?: string | null
          departedAt?: string | null
          completedAt?: string | null
        }

        interface WaybillRoutePoint {
          name?: string | null
          address?: string | null
          type?: string | null
          capturedAt?: string | null
          speedKmh?: number | null
          source?: string | null
          longitude: number
          latitude: number
        }

        interface WaybillExpenseLocationRecord {
          id: string
          occurredOn: string
          expenseLocation?: string | null
          expenseLongitude: number
          expenseLatitude: number
          expenseCoordinateSource?: string | null
          expenseItem?: {
            id?: string
            itemCode: string
            itemName: string
            businessCategory?: string | null
          } | null
        }

        type WaybillCostFieldKey =
          'costAmounts' | 'paymentDetails' | 'driverPhone' | 'expenseLocation' | 'expenseEvidence'

        interface WaybillCostRecord {
          id: string
          costNo?: string | null
          sourceType?: string | null
          costType: string
          amount?: number | string | null
          quantity?: number | string | null
          unitPrice?: number | string | null
          occurredOn: string
          providerName?: string | null
          payeeName?: string | null
          paymentChannel?: string | null
          invoiceNo?: string | null
          meterNo?: string | null
          expenseLocation?: string | null
          expenseRegion?: string | null
          remark?: string | null
          attachments?: string[]
          reporterNameSnapshot?: string | null
          auditStatus?: string | null
          settlementStatus?: string | null
          submittedAt?: string | null
          reviewedAt?: string | null
          reviewRemark?: string | null
          paidAt?: string | null
          expenseItem?: {
            id: string
            itemCode: string
            itemName: string
          } | null
          reimbursement?: {
            id: string
            reimbursementNo: string
            status: string
          } | null
          expensePayment?: {
            id: string
            paymentNo: string
            paymentDate?: string | null
          } | null
          fieldAccess?: Partial<Record<WaybillCostFieldKey, Api.Tms.BasicData.FieldAccessLevel>>
        }

        interface WaybillDriverSummary {
          id: string
          driverName: string
          phone?: string | null
          licenseType?: string | null
        }

        interface WaybillVehicleSummary {
          id: string
          plateNo: string
          vehicleType?: string | null
          brandModel?: string | null
          approvedLoadMass?: number | null
          vehiclePhotoUrl?: string | null
        }

        interface WaybillCarrierSummary {
          id: string
          companyName: string
          contactName?: string | null
          contactPhone?: string | null
        }

        interface WaybillCargoSummary {
          id: string
          cargoCode?: string | null
          cargoName: string
          unit?: string | null
        }

        interface WaybillEventRecord {
          id: string
          waybillId: string
          eventType: string
          eventTime: string
          operatorName?: string | null
          locationText?: string | null
          longitude?: number | null
          latitude?: number | null
          payload: Record<string, unknown>
          remark?: string | null
          createBy?: string | null
          createTime: string
        }

        interface WaybillProofRecord {
          id: string
          waybillId: string
          proofType: string
          attachmentId?: string | null
          fileUrl: string
          fileName?: string | null
          mimeType?: string | null
          fileSize?: number | null
          uploadedAt?: string | null
          uploaderName?: string | null
          remark?: string | null
        }

        interface WaybillDetailRecord {
          id: string
          tenantId: string
          waybillNo: string
          executionKind?: 'single' | 'merge' | 'split'
          status: WaybillStatus | string
          orderId?: string | null
          carrierId?: string | null
          driverId?: string | null
          vehicleId?: string | null
          cargoId?: string | null
          originCity?: string | null
          destinationCity?: string | null
          shipperName?: string | null
          shipperPhone?: string | null
          shipperAddress?: string | null
          receiverName?: string | null
          receiverPhone?: string | null
          receiverAddress?: string | null
          shipperLongitude?: number | null
          shipperLatitude?: number | null
          receiverLongitude?: number | null
          receiverLatitude?: number | null
          plannedLoadTime?: string | null
          plannedUnloadTime?: string | null
          acceptedAt?: string | null
          loadedAt?: string | null
          departedAt?: string | null
          arrivedAt?: string | null
          unloadedAt?: string | null
          completedAt?: string | null
          cancelledAt?: string | null
          cargoName?: string | null
          cargoType?: string | null
          cargoWeightTon?: number | null
          cargoVolumeM3?: number | null
          cargoQuantity?: number | null
          freightAmount?: number | string | null
          estimatedDurationMin?: number | null
          remainingDistanceKm?: number | null
          routePoints: unknown
          pickupPhotos: string[]
          deliveryPhotos: string[]
          receiptAttachments: string[]
          remark?: string | null
          createBy?: string | null
          createTime: string
          updateBy?: string | null
          updateTime: string
          order?: Api.Tms.Order.OrderRecord | null
          driver?: WaybillDriverSummary | null
          vehicle?: WaybillVehicleSummary | null
          carrier?: WaybillCarrierSummary | null
          cargo?: WaybillCargoSummary | null
          events: WaybillEventRecord[]
          proofs: WaybillProofRecord[]
          cargoOperations: CargoOperationRecord[]
          costs: WaybillCostRecord[]
          expenseLocations: WaybillExpenseLocationRecord[]
          sources?: ExecutionSource[]
          execution?: ExecutionRecord | null
          fieldAccess?: WaybillFieldAccessMap
          isRecordOwner?: boolean
        }

        interface DispatchVehicleOption extends Api.Tms.BasicData.VehicleReferenceOption {
          primaryDriverId?: string | null
          primaryDriver?: BasicData.DriverOption | null
          tonnageOrSeat?: string | null
          overallLength?: number | null
        }

        type WaybillSearchParams = Partial<
          Api.Tms.Order.OrderSearchParams & {
            dispatchStatus?: DispatchStatus | string
            dispatchStatuses?: Array<DispatchStatus | string>
            waybillStatus?: string
            dispatchVehicleId?: string | null
            vehicleKeyword?: string
            plannedTimeRange?: string[]
          }
        >

        type DispatchVehicleSearchParams = Api.Common.CommonSearchParams & {
          keyword?: string
        }

        interface WaybillDispatchPayload {
          id?: string
          ids?: string[]
          dispatchMode: 'carrier' | 'self_operated' | 'individual_driver'
          dispatchCarrierId?: string | null
          dispatchAgreementId?: string | null
          dispatchVehicleId: string
          dispatchDriverId?: string | null
          dispatchPlateNo: string
          dispatchVehicleType?: string | null
          dispatchVehicleLength?: string | null
          dispatchDriverName?: string | null
          dispatchDriverPhone?: string | null
          plannedDepartureTime: string
          plannedArrivalTime: string
          dispatchRemark?: string | null
        }

        type CargoOperationType = 'loading' | 'unloading'
        type CargoOperationStatus = 'checked_in' | 'completed'
        type CargoOperationCheckinMode = 'manual' | 'automatic' | 'admin'

        interface CargoOperationRecord {
          id: string
          tenantId: string
          waybillId: string
          operationType: CargoOperationType
          operationStatus: CargoOperationStatus
          checkinTime: string
          checkinMode: CargoOperationCheckinMode
          operatorName?: string | null
          longitude: number
          latitude: number
          locationAccuracyM?: number | null
          locationText?: string | null
          geofenceCenterLongitude: number
          geofenceCenterLatitude: number
          geofenceRadiusM: number
          distanceM: number
          insideGeofence: boolean
          outsideReason?: string | null
          weightTon?: number | null
          photoUrls: string[]
          weighbridgeTicketUrls: string[]
          completedAt?: string | null
          remark?: string | null
          createBy?: string | null
          createTime: string
          updateBy?: string | null
          updateTime: string
        }

        interface CargoOperationContext {
          waybillId: string
          operationType: CargoOperationType
          waybillStatus: string
          centerLongitude?: number | null
          centerLatitude?: number | null
          radiusM: number
          allowOutsideCheckIn: boolean
          autoCheckIn: boolean
          geofenceEnabled: boolean
          canManage: boolean
          operation?: CargoOperationRecord | null
        }

        interface CargoOperationCheckinPayload {
          waybillId: string
          operationType: CargoOperationType
          longitude: number
          latitude: number
          accuracyM?: number | null
          locationText?: string | null
          outsideReason?: string | null
          automatic?: boolean
        }

        interface CargoOperationCompletePayload {
          waybillId: string
          operationType: CargoOperationType
          weightTon: number
          photoUrls: string[]
          weighbridgeTicketUrls: string[]
          remark?: string | null
        }

        type ExecutionAction = 'departure' | 'signature' | 'completion'

        interface ExecutionRecord {
          id: string
          tenantId: string
          waybillId: string
          departureTime?: string | null
          departureOdometerKm?: number | null
          departurePhotoUrls: string[]
          departureRemark?: string | null
          departureOperatorName?: string | null
          departureRecordedAt?: string | null
          signedAt?: string | null
          signerName?: string | null
          receiptUrls: string[]
          signatureUrls: string[]
          signatureRemark?: string | null
          signatureOperatorName?: string | null
          signatureRecordedAt?: string | null
          returnTime?: string | null
          returnOdometerKm?: number | null
          emptyMileageKm?: number | null
          departureFuelLiters?: number | null
          refueledLiters?: number | null
          returnFuelLiters?: number | null
          returnPhotoUrls: string[]
          completionRemark?: string | null
          completionOperatorName?: string | null
          completionRecordedAt?: string | null
          createTime: string
          updateTime: string
        }

        interface ExecutionContext {
          waybillId: string
          waybillStatus: string
          loadingStatus?: CargoOperationStatus | null
          unloadingStatus?: CargoOperationStatus | null
          arrivalTime?: string | null
          arrivalAddress?: string | null
          arrivalLongitude?: number | null
          arrivalLatitude?: number | null
          canAccept: boolean
          canDepart: boolean
          canArrive: boolean
          canUnload: boolean
          canSign: boolean
          canComplete: boolean
          canCancel: boolean
          needsReturnCompletion: boolean
          record?: ExecutionRecord | null
        }

        interface ExecutionDeparturePayload {
          waybillId: string
          departureTime: string
          odometerKm: number
          photoUrls: string[]
          remark?: string | null
        }

        interface ExecutionSignaturePayload {
          waybillId: string
          signedAt: string
          signerName: string
          receiptUrls: string[]
          signatureUrls: string[]
          remark?: string | null
        }

        interface ExecutionCompletionPayload {
          waybillId: string
          returnTime: string
          returnOdometerKm: number
          emptyMileageKm?: number | null
          departureFuelLiters?: number | null
          refueledLiters?: number | null
          returnFuelLiters?: number | null
          photoUrls: string[]
          remark?: string | null
        }

        interface DispatchRecommendationDriver {
          id: string
          driverName: string
          phone?: string | null
          licenseType?: string | null
          licenseExpireDate?: string | null
        }

        interface DispatchRecommendationVehicle {
          id: string
          carrierId?: string | null
          plateNo: string
          companyName?: string | null
          vehicleType?: string | null
          tonnageOrSeat?: string | null
          overallLength?: number | null
          approvedLoadMass?: number | null
          primaryDriver: DispatchRecommendationDriver
        }

        interface DispatchRecommendation {
          rank: number
          score: number
          confidence: number
          vehicle: DispatchRecommendationVehicle
          reasons: string[]
          warnings: string[]
          metrics: {
            capacityUtilization?: number | null
            routeTrips: number
            historyTrips: number
            onTimeRate?: number | null
          }
        }

        interface DispatchRecommendationResponse {
          runId: string
          ruleVersion: string
          generatedAt: string
          order: {
            id: string
            orderNo: string
            originStation: string
            destinationStation: string
          }
          summary: string
          recommendations: DispatchRecommendation[]
          evaluatedVehicles: number
          eligibleVehicles: number
          rejectedVehicles: number
          rejectedByReason: Record<string, number>
        }
      }

      namespace Delivery {
        type DeliveryStatus = 'pending_sign' | 'signed' | 'completed'
        type DeliveryRecord = Api.Tms.Order.OrderRecord
        type DeliverySearchParams = Partial<
          Api.Tms.Order.OrderSearchParams & {
            deliveryStatus?: string
            orderStatuses?: string[]
            signedTimeRange?: string[]
          }
        >

        type DeliveryReceiptArchivePayload = Pick<
          DeliveryRecord,
          'id' | 'signedCodAmount' | 'receiptImageUrls' | 'signedAt'
        >

        type ReceiptOcrField =
          | 'waybillNo'
          | 'signerName'
          | 'signedAt'
          | 'deliveryResult'
          | 'signedQuantity'
          | 'damagedQuantity'
          | 'shortageQuantity'
          | 'exceptionNote'
        type ReceiptDeliveryResult =
          'normal' | 'damaged' | 'shortage' | 'refused' | 'partial' | 'unclear'
        type ReceiptRiskLevel = 'none' | 'medium' | 'high' | 'critical'

        interface ReceiptOcrDraft {
          waybillNo: string | null
          signerName: string | null
          signedAt: string | null
          deliveryResult: ReceiptDeliveryResult
          signedQuantity: number | null
          damagedQuantity: number | null
          shortageQuantity: number | null
          exceptionNote: string | null
        }

        interface ReceiptOcrSignal {
          type: string
          severity: Exclude<ReceiptRiskLevel, 'none'>
          title: string
          detail: string
        }

        interface ReceiptOcrAssessment {
          riskLevel: ReceiptRiskLevel
          matched: boolean
          signals: ReceiptOcrSignal[]
          recommendedAction: 'normal_review' | 'manual_review' | 'block_completion'
        }

        interface ReceiptOcrAnalyzeRequest {
          action: 'analyze'
          imageUrls: string[]
          orderId: string
          orderNo: string
          receiverName?: string | null
          plannedArrivalTime?: string | null
          cargoQuantityTotal?: number | null
        }

        interface ReceiptOcrAnalyzeResponse {
          artifactId: string
          runId: string
          generatedAt: string
          rawText: string
          summary: string
          confidence: number
          fieldConfidence: Partial<Record<ReceiptOcrField, number>>
          missingFields: string[]
          warnings: string[]
          receipt: ReceiptOcrDraft
          assessment: ReceiptOcrAssessment
          reviewConfidenceThreshold: number
          order: {
            id: string
            orderNo: string
            receiverName?: string | null
            plannedArrivalTime?: string | null
            cargoQuantityTotal?: number | null
          }
        }

        interface ReceiptOcrReviewRequest {
          action: 'review'
          artifactId: string
          entityId: string
          outcome: 'applied'
          finalPayload: Record<string, unknown>
          reviewNote?: string
        }

        interface ReceiptOcrReviewResponse {
          artifactId: string
          status: 'applied'
          acceptedFields: string[]
          correctedFields: string[]
        }

        type ReceiptExceptionStatus =
          'pending' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'
        type ReceiptExceptionSeverity = 'low' | 'medium' | 'high' | 'critical'

        interface ReceiptExceptionWorkOrder {
          id: string
          tenantId: string
          workOrderNo: string
          orderId: string
          aiArtifactReviewId: string
          orderNoSnapshot: string
          severity: ReceiptExceptionSeverity
          status: ReceiptExceptionStatus
          exceptionTypes: string[]
          summary: string
          evidenceUrls: string[]
          assigneeId?: string | null
          dueAt: string
          startedAt?: string | null
          resolutionNote?: string | null
          createBy?: string | null
          createTime: string
          updateTime: string
        }
      }
    }

    /** Shared finance domain contracts. Transport-backed records remain source-specific DTOs. */
    namespace Tms {
      namespace InTransit {
        interface RoutePoint {
          type?: string
          name?: string | null
          address?: string | null
          capturedAt?: string | null
          timestamp?: string | null
          recordedAt?: string | null
          speedKmh?: number | string | null
          source?: string | null
          longitude?: number | string | null
          latitude?: number | string | null
          lng?: number | string | null
          lat?: number | string | null
        }

        interface MonitorRecord {
          id?: string
          tenantId?: string
          waybillNo: string
          status?: string | null
          driverId?: string | null
          vehicleId?: string | null
          shipperAddressId?: string | null
          receiverAddressId?: string | null
          originCity?: string | null
          destinationCity?: string | null
          shipperName?: string | null
          shipperPhone?: string | null
          shipperAddress?: string | null
          shipperLongitude?: number | string | null
          shipperLatitude?: number | string | null
          receiverName?: string | null
          receiverPhone?: string | null
          receiverAddress?: string | null
          receiverLongitude?: number | string | null
          receiverLatitude?: number | string | null
          plannedLoadTime?: string | null
          plannedUnloadTime?: string | null
          acceptedAt?: string | null
          loadedAt?: string | null
          departedAt?: string | null
          unloadedAt?: string | null
          completedAt?: string | null
          currentLongitude?: number | string | null
          currentLatitude?: number | string | null
          speedKmh?: number | string | null
          cargoName?: string | null
          cargoWeightTon?: number | string | null
          cargoVolumeM3?: number | string | null
          cargoQuantity?: number | string | null
          freightAmount?: number | string | null
          routePoints?: RoutePoint[] | null
          remark?: string | null
          cancelledAt?: string | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
          order?: Api.Tms.Order.OrderRecord | null
          vehicle?: Api.Tms.Waybill.DispatchVehicleOption | null
          driver?: Api.Tms.BasicData.DriverOption | null
          fieldAccess?: Api.Tms.Waybill.WaybillFieldAccessMap
          isRecordOwner?: boolean
        }

        type TransportAnomalyType =
          | 'arrival_overdue'
          | 'departure_overdue'
          | 'data_stale'
          | 'missing_assignment'
          | 'missing_schedule'
          | 'status_mismatch'

        type TransportRiskLevel = 'critical' | 'high' | 'medium' | 'low'

        interface TransportAnomalySignal {
          type: TransportAnomalyType
          severity: Exclude<TransportRiskLevel, 'low'>
          title: string
          detail: string
          evidence: string[]
        }

        interface TransportAnomalyAssessment {
          orderId: string
          orderNo: string
          route: string
          orderStatus: string
          waybillStatus: string
          riskLevel: TransportRiskLevel
          riskScore: number
          confidence: number
          summary: string
          signals: TransportAnomalySignal[]
          recommendedActions: string[]
          limitations: string[]
          metrics: {
            overdueArrivalHours: number
            overdueDepartureHours: number
            staleHours: number
            hasVehicle: boolean
            hasDriver: boolean
            hasSchedule: boolean
          }
        }

        interface TransportAnomalyAdvisorResponse {
          runId: string
          ruleVersion: string
          generatedAt: string
          assessment: TransportAnomalyAssessment
        }

        type MonitorSearchParams = Api.Common.CommonSearchParams & {
          keyword?: string
          statuses?: string[]
        }
      }

      namespace Station {
        type StationType = 'shipping' | 'transfer' | 'arrival'

        interface StationRoleRecord {
          id?: string
          stationId?: string
          roleType: StationType | string
          tenantId?: string
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
        }

        interface StationRecord {
          id?: string
          tenantId?: string
          stationCode?: string
          stationName: string
          /** 兼容用主类型；完整业务能力读取 stationRoles。 */
          stationType: StationType | string
          stationRoles?: StationRoleRecord[]
          regionCode?: string | null
          managerName?: string | null
          contactPhone?: string | null
          enabled?: boolean
          sort?: number
          remark?: string | null
          createBy?: string
          createTime?: string
          updateBy?: string
          updateTime?: string
        }

        type StationSavePayload = Omit<
          StationRecord,
          'stationType' | 'stationRoles' | 'createBy' | 'createTime' | 'updateBy' | 'updateTime'
        > & {
          stationTypes: Array<StationType | string>
        }

        type StationSearchParams = Partial<
          Pick<StationRecord, 'stationType' | 'enabled'> &
            Api.Common.CommonSearchParams & {
              keyword?: string
              createTimeRange?: string[]
            }
        >

        type StationOptionSearchParams = Partial<
          Pick<StationRecord, 'stationType'> & {
            tenantId?: string
            keyword?: string
          }
        >
      }

      namespace TransportEvent {
        interface WaybillSnapshot {
          id: string
          waybillNo: string
          status: string
          originCity?: string | null
          destinationCity?: string | null
          plannedUnloadTime?: string | null
        }

        interface Record {
          id: string
          tenantId: string
          waybillId: string
          eventType: string
          eventTime: string
          operatorName?: string | null
          locationText?: string | null
          remark?: string | null
          createTime: string
          waybill?: WaybillSnapshot | null
          delayed: boolean
        }

        interface SearchParams extends Api.Common.CommonSearchParams {
          keyword?: string
          eventType?: string
          eventTimeRange?: string[]
        }

        interface Overview {
          eventCount7d: number
          activeWaybillCount: number
          delayedWaybillCount: number
          exceptionEventCount: number
        }
      }

      namespace RoutePerformance {
        interface Record {
          id: string
          originCity: string
          destinationCity: string
          completedTrips: number
          scheduledTrips: number
          onTimeTrips: number
          onTimeRate?: number | null
          averageDurationHours?: number | null
          averageDelayHours?: number | null
          cargoWeightTon: number
          activeTrips: number
          delayedActiveTrips: number
        }

        interface Overview {
          generatedAt: string
          periodDays: number
          totalRecords: number
          returnedRecords: number
          truncated: boolean
          routeCount: number
          completedTrips: number
          activeTrips: number
          delayedActiveTrips: number
          onTimeRate?: number
          cargoWeightTon: number
          records: Record[]
        }
      }

      namespace CapacityPlanning {
        type PeriodDays = 7 | 14 | 30

        interface DailyCapacity {
          date: string
          demandTrips: number
          demandTon: number
          assignedVehicles: number
          unassignedTrips: number
          fleetCapacityTon: number
          loadRate?: number | null
        }

        interface BacklogWaybill {
          id: string
          waybillNo: string
          status: string
          originCity?: string | null
          destinationCity?: string | null
          plannedLoadTime?: string | null
          cargoWeightTon?: number | null
          waitingHours: number
        }

        interface Overview {
          generatedAt: string
          periodDays: PeriodDays
          activeFleetCount: number
          fleetCapacityTon: number
          activeWaybillCount: number
          assignedVehicleCount: number
          availableVehicleCount: number
          unassignedActiveCount: number
          backlogCount: number
          returnedBacklogCount: number
          truncated: boolean
          daily: DailyCapacity[]
          backlog: BacklogWaybill[]
        }
      }
    }
  }
}
