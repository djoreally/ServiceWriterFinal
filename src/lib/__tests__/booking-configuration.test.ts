import { buildAppointmentBookingConfiguration, configurationInventoryTotal } from "../booking-configuration";

describe("appointment booking configuration", () => {
  it("preserves staggered tire fitment, SKU, quantities, options and detailing assessment", () => {
    // Schema v2 builds each section only when the vehicle's selected
    // services imply its requirements (oil_fitment / tire_fitment /
    // detailing_assessment), so the selection is part of the input.
    const configuration=buildAppointmentBookingConfiguration([{id:"vehicle-1",year:"2022",make:"BMW",model:"M3",licensePlate:"TEST",vin:"",mileage:"12000",engine:"3.0L",oilType:"0W-30",oilCapacity:"7.4 qt",oilCapacitySource:"db",tireSize:"275/35R19",rearTireSize:"285/30R20",tireSizeSource:"oe",tireFrontQuantity:2,tireRearQuantity:2,tireInventoryItemId:"inventory-1",tireInventorySku:"TIRE-1",tireInventoryName:"Road Tire",tireUnitPrice:200,tireMountAndBalance:true,tireTpms:true,tireDisposal:true,detailingVehicleSize:"midsize",detailingCondition:"moderate"}],{"vehicle-1":{services:[{id:"svc-1",name:"Oil Change, Tires & Detailing",default_price:0,booking_requirements:["oil_fitment","tire_fitment","detailing_assessment"]}],package:null}});
    expect(configuration.vehicles[0].oil).toEqual({engine:"3.0L",oilType:"0W-30",oilCapacity:"7.4 qt",capacitySource:"db"});
    expect(configuration.vehicles[0].tire).toMatchObject({frontSize:"275/35R19",rearSize:"285/30R20",frontQuantity:2,rearQuantity:2,sku:"TIRE-1"});
    expect(configuration.vehicles[0].detailing).toMatchObject({vehicleSize:"midsize",condition:"moderate",site:{mobileAccessConfirmed:false},photos:[]});
    expect(configurationInventoryTotal(configuration)).toBe(800);
  });
  it("stores zero product quantity for rotation or repair service without inventory", () => {
    const configuration = buildAppointmentBookingConfiguration([
      {
        id: "vehicle-2",
        year: "2022",
        make: "Honda",
        model: "Accord",
        licensePlate: "",
        vin: "",
        mileage: "",
        tireSize: "235/40R19",
      },
    ], {
      "vehicle-2": {
        services: [{ id: "svc-rotation", name: "Tire Rotation", default_price: 0 }],
        package: null,
      },
    });
    expect(configuration.vehicles[0].tire).toMatchObject({
      frontQuantity: 0,
      rearQuantity: 0,
    });
  });

  it("rejects inventory selection without an explicit quantity", () => {
    expect(() =>
      buildAppointmentBookingConfiguration([
        {
          id: "vehicle-3",
          year: "2022",
          make: "Honda",
          model: "Accord",
          licensePlate: "",
          vin: "",
          mileage: "",
          tireSize: "235/40R19",
          tireInventoryItemId: "inventory-3",
        },
      ], {
        "vehicle-3": {
          services: [{ id: "svc-tires", name: "Tire Replacement", default_price: 0, booking_requirements: ["tire_fitment"] }],
          package: null,
        },
      }),
    ).toThrow("Tire quantity must be explicitly selected");
  });
});
